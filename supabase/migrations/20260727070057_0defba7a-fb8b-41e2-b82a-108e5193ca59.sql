
-- 2. Extend ratings
ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS sub_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS overall numeric(3,2),
  ADD COLUMN IF NOT EXISTS unlocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_bonus_awarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

-- Backfill overall from legacy stars, mark old ones as visible
UPDATE public.ratings SET overall = stars::numeric WHERE overall IS NULL;
UPDATE public.ratings SET unlocked_at = created_at WHERE unlocked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ratings_unique_per_reviewer ON public.ratings (engagement_id, from_user_id);
CREATE INDEX IF NOT EXISTS ratings_engagement_idx ON public.ratings (engagement_id);
CREATE INDEX IF NOT EXISTS ratings_to_user_idx ON public.ratings (to_user_id) WHERE unlocked_at IS NOT NULL;

-- 3. Time machine
CREATE TABLE IF NOT EXISTS public.admin_time_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  offset_days integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.admin_time_settings(id, offset_days) VALUES (true, 0) ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.admin_time_settings TO authenticated;
GRANT ALL ON public.admin_time_settings TO service_role;
ALTER TABLE public.admin_time_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "time_settings_read" ON public.admin_time_settings;
CREATE POLICY "time_settings_read" ON public.admin_time_settings FOR SELECT TO authenticated USING (true);

-- 4. sim_now
CREATE OR REPLACE FUNCTION public.sim_now()
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT now() + (COALESCE((SELECT offset_days FROM public.admin_time_settings WHERE id = true), 0) || ' days')::interval;
$$;
REVOKE ALL ON FUNCTION public.sim_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sim_now() TO authenticated, service_role;

-- 5. rating_opens_at(engagement_id)
CREATE OR REPLACE FUNCTION public.rating_opens_at(_engagement_id uuid)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _e public.engagements%ROWTYPE;
  _r public.requests%ROWTYPE;
  _dates date[];
  _first_start date;
  _first_end date;
  _prev date;
  _d date;
BEGIN
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF _e.request_id IS NOT NULL THEN
    SELECT * INTO _r FROM public.requests WHERE id = _e.request_id;
    IF FOUND AND _r.season_dates IS NOT NULL AND array_length(_r.season_dates,1) > 0 THEN
      SELECT ARRAY(SELECT unnest(_r.season_dates) ORDER BY 1) INTO _dates;
      _first_start := _dates[1];
      _first_end := _dates[1];
      _prev := _dates[1];
      FOR i IN 2..array_length(_dates,1) LOOP
        _d := _dates[i];
        IF _d = _prev + 1 THEN
          _first_end := _d;
          _prev := _d;
        ELSE
          EXIT;
        END IF;
      END LOOP;
      -- 15-day safeguard
      IF (_first_end - _first_start) >= 14 THEN
        _first_end := _first_start + 14;
      END IF;
      RETURN (_first_end + 1)::timestamptz;
    END IF;
  END IF;

  RETURN (_e.end_date + 1)::timestamptz;
END;
$$;
REVOKE ALL ON FUNCTION public.rating_opens_at(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rating_opens_at(uuid) TO authenticated, service_role;

-- 6. submit_rating_v2
CREATE OR REPLACE FUNCTION public.submit_rating_v2(
  _engagement_id uuid,
  _sub_scores jsonb,
  _overall numeric,
  _comment text DEFAULT NULL
) RETURNS public.ratings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
  _to uuid;
  _opens timestamptz;
  _row public.ratings;
  _other public.ratings;
  _stars int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Engagement not found'; END IF;
  IF _uid NOT IN (_e.freelancer_id, _e.team_id) THEN RAISE EXCEPTION 'Not a party'; END IF;
  IF _e.status <> 'confirmed' AND _e.status <> 'completed' THEN RAISE EXCEPTION 'Engagement not active'; END IF;

  _opens := public.rating_opens_at(_engagement_id);
  IF _opens IS NULL OR public.sim_now() < _opens THEN RAISE EXCEPTION 'Rating not open yet'; END IF;

  _to := CASE WHEN _uid = _e.freelancer_id THEN _e.team_id ELSE _e.freelancer_id END;
  _stars := GREATEST(1, LEAST(5, ROUND(_overall)::int));

  INSERT INTO public.ratings(engagement_id, from_user_id, to_user_id, stars, comment, sub_scores, overall)
  VALUES (_engagement_id, _uid, _to, _stars, _comment, COALESCE(_sub_scores, '{}'::jsonb), _overall)
  RETURNING * INTO _row;

  -- Bonus token
  IF NOT _row.token_bonus_awarded THEN
    PERFORM public.credit_tokens(_uid, 1, 'rating_bonus'::public.token_reason, _engagement_id, 'Rating submitted bonus');
    UPDATE public.ratings SET token_bonus_awarded = true WHERE id = _row.id RETURNING * INTO _row;
  END IF;

  -- Reciprocal check
  SELECT * INTO _other FROM public.ratings WHERE engagement_id = _engagement_id AND from_user_id = _to LIMIT 1;
  IF FOUND THEN
    UPDATE public.ratings SET unlocked_at = now() WHERE engagement_id = _engagement_id AND unlocked_at IS NULL;
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_uid, 'rating_unlocked', jsonb_build_object('engagement_id', _engagement_id)),
      (_to, 'rating_unlocked', jsonb_build_object('engagement_id', _engagement_id));
  ELSE
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_to, 'rating_received', jsonb_build_object('engagement_id', _engagement_id));
  END IF;

  RETURN _row;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_rating_v2(uuid, jsonb, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_rating_v2(uuid, jsonb, numeric, text) TO authenticated, service_role;

-- 7. Public rating summary (unlocked only, includes fallback: >30d)
CREATE OR REPLACE FUNCTION public.get_user_rating_summary(_user_id uuid)
RETURNS TABLE(count integer, average numeric, tech numeric, punct numeric, stress numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH visible AS (
    SELECT r.*
    FROM public.ratings r
    WHERE r.to_user_id = _user_id
      AND (r.unlocked_at IS NOT NULL OR r.created_at < (public.sim_now() - interval '30 days'))
  )
  SELECT
    COUNT(*)::int,
    ROUND(AVG(COALESCE(overall, stars))::numeric, 2),
    ROUND(AVG(NULLIF((sub_scores->>'technical')::numeric, 0))::numeric, 2),
    ROUND(AVG(NULLIF((sub_scores->>'punctuality')::numeric, 0))::numeric, 2),
    ROUND(AVG(NULLIF((sub_scores->>'stress')::numeric, 0))::numeric, 2)
  FROM visible;
$$;
REVOKE ALL ON FUNCTION public.get_user_rating_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_rating_summary(uuid) TO authenticated, service_role;

-- 8. Admin time offset
CREATE OR REPLACE FUNCTION public.admin_set_time_offset(_days integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(_uid, 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.admin_time_settings SET offset_days = _days, updated_at = now(), updated_by = _uid WHERE id = true;
  RETURN _days;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_time_offset(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_time_offset(integer) TO authenticated, service_role;

-- 9. Notifier: for every confirmed/completed engagement past opens_at, emit rating_available if not yet
CREATE OR REPLACE FUNCTION public.emit_rating_available_notifications()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cnt integer := 0;
  _r record;
  _opens timestamptz;
  _exists_f boolean;
  _exists_t boolean;
BEGIN
  FOR _r IN
    SELECT e.id, e.freelancer_id, e.team_id
    FROM public.engagements e
    WHERE e.status IN ('confirmed', 'completed')
  LOOP
    _opens := public.rating_opens_at(_r.id);
    IF _opens IS NULL OR public.sim_now() < _opens THEN CONTINUE; END IF;

    SELECT EXISTS(SELECT 1 FROM public.notifications WHERE user_id = _r.freelancer_id AND kind = 'rating_available' AND (payload->>'engagement_id')::uuid = _r.id) INTO _exists_f;
    SELECT EXISTS(SELECT 1 FROM public.notifications WHERE user_id = _r.team_id AND kind = 'rating_available' AND (payload->>'engagement_id')::uuid = _r.id) INTO _exists_t;

    IF NOT _exists_f THEN
      INSERT INTO public.notifications(user_id, kind, payload) VALUES (_r.freelancer_id, 'rating_available', jsonb_build_object('engagement_id', _r.id));
      _cnt := _cnt + 1;
    END IF;
    IF NOT _exists_t THEN
      INSERT INTO public.notifications(user_id, kind, payload) VALUES (_r.team_id, 'rating_available', jsonb_build_object('engagement_id', _r.id));
      _cnt := _cnt + 1;
    END IF;
  END LOOP;
  RETURN _cnt;
END;
$$;
REVOKE ALL ON FUNCTION public.emit_rating_available_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emit_rating_available_notifications() TO authenticated, service_role;

-- 10. Cron every 10 min
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN
  PERFORM cron.unschedule('emit-rating-available');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('emit-rating-available', '*/10 * * * *', $$ SELECT public.emit_rating_available_notifications(); $$);

-- 11. Tighten ratings RLS: only visible rows for public reads
DROP POLICY IF EXISTS "ratings_public_read" ON public.ratings;
DROP POLICY IF EXISTS "ratings_read_visible" ON public.ratings;
CREATE POLICY "ratings_read_visible" ON public.ratings FOR SELECT TO authenticated
  USING (
    unlocked_at IS NOT NULL
    OR from_user_id = auth.uid()
    OR to_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );
