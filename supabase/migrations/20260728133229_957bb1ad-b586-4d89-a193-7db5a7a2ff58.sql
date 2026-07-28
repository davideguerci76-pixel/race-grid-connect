
-- 1. Enum additions (notif_kind)
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'match_reopened';
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'sos_call';
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'sos_taken';
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'engagement_cancelled';
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'request_unfilled';

-- 2. New columns on engagements
ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancellation_kind text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS no_show boolean NOT NULL DEFAULT false;

-- Backfill confirmed_at for existing confirmed engagements (best-effort using updated_at)
UPDATE public.engagements SET confirmed_at = COALESCE(confirmed_at, updated_at)
  WHERE status IN ('confirmed','completed') AND confirmed_at IS NULL;

-- 3. New settings row
INSERT INTO public.platform_settings(key, value_num, category, label, description, unit, sort_order)
VALUES ('sos_min_match_pct', 75, 'matching', 'SOS minimum match %', 'Freelancers whose skills_score is at or above this value receive SOS Call notifications for a request on its first day.', '%', 100)
ON CONFLICT (key) DO NOTHING;

-- 4. SOS tables
CREATE TABLE IF NOT EXISTS public.sos_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  team_id uuid NOT NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  triggered_by uuid NOT NULL,
  auto_triggered boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_engagement_id uuid REFERENCES public.engagements(id) ON DELETE SET NULL,
  min_pct integer NOT NULL,
  radius_km integer,
  target_count integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.sos_calls TO authenticated;
GRANT ALL ON public.sos_calls TO service_role;

CREATE TABLE IF NOT EXISTS public.sos_call_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_id uuid NOT NULL REFERENCES public.sos_calls(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL,
  match_id uuid,
  skills_score numeric NOT NULL,
  distance_km numeric,
  notified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sos_id, freelancer_id)
);
GRANT SELECT ON public.sos_call_targets TO authenticated;
GRANT ALL ON public.sos_call_targets TO service_role;

ALTER TABLE public.sos_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sos_calls_read ON public.sos_calls;
CREATE POLICY sos_calls_read ON public.sos_calls FOR SELECT TO authenticated
  USING (
    team_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.sos_call_targets t WHERE t.sos_id = sos_calls.id AND t.freelancer_id = auth.uid())
  );

ALTER TABLE public.sos_call_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sos_targets_read ON public.sos_call_targets;
CREATE POLICY sos_targets_read ON public.sos_call_targets FOR SELECT TO authenticated
  USING (
    freelancer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.sos_calls s WHERE s.id = sos_call_targets.sos_id AND s.team_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_sos_calls_request ON public.sos_calls(request_id);
CREATE INDEX IF NOT EXISTS idx_sos_calls_open ON public.sos_calls(request_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sos_targets_freelancer ON public.sos_call_targets(freelancer_id);

-- 5. Extend accept_match_confirmation to stamp confirmed_at
CREATE OR REPLACE FUNCTION public.accept_match_confirmation(_engagement_id uuid)
 RETURNS public.engagements
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
  _other record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _e.freelancer_id <> _uid THEN RAISE EXCEPTION 'Only the freelancer can accept'; END IF;
  IF _e.status <> 'proposed' THEN RAISE EXCEPTION 'Match request is no longer pending'; END IF;

  UPDATE public.engagements SET status = 'confirmed', confirmed_at = now(), updated_at = now()
    WHERE id = _engagement_id RETURNING * INTO _e;

  IF _e.match_id IS NOT NULL THEN
    INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
      VALUES (_e.team_id, _e.match_id, _e.request_id, _e.freelancer_id, true)
      ON CONFLICT DO NOTHING;
    UPDATE public.matches SET revealed_by_team = true, revealed_by_freelancer = true
      WHERE id = _e.match_id;
  END IF;

  IF _e.request_id IS NOT NULL THEN
    INSERT INTO public.request_team_reveals(user_id, request_id)
      VALUES (_e.freelancer_id, _e.request_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.team_reveals(user_id, team_id)
      VALUES (_e.freelancer_id, _e.team_id) ON CONFLICT DO NOTHING;

    UPDATE public.requests SET status = 'filled', is_active = false, updated_at = now()
      WHERE id = _e.request_id;

    FOR _other IN
      SELECT id, freelancer_id FROM public.engagements
      WHERE request_id = _e.request_id AND id <> _e.id AND status = 'proposed'
    LOOP
      UPDATE public.engagements SET status = 'cancelled', updated_at = now() WHERE id = _other.id;
      INSERT INTO public.notifications(user_id, kind, payload) VALUES
        (_other.freelancer_id, 'match_taken', jsonb_build_object('engagement_id', _other.id, 'request_id', _e.request_id));
    END LOOP;
  END IF;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_e.team_id, 'engagement_confirmed',
     jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id, 'freelancer_id', _e.freelancer_id));

  RETURN _e;
END;
$function$;

-- 6. Cancel engagement RPC
CREATE OR REPLACE FUNCTION public.cancel_engagement(_engagement_id uuid, _reason text DEFAULT NULL)
 RETURNS public.engagements
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
  _now timestamptz := public.sim_now();
  _first_day date;
  _is_team boolean;
  _is_grace boolean;
  _kind text;
  _other record;
  _r public.requests%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Engagement not found'; END IF;
  IF _uid <> _e.freelancer_id AND _uid <> _e.team_id THEN RAISE EXCEPTION 'Not a party'; END IF;
  IF _e.status NOT IN ('confirmed') THEN RAISE EXCEPTION 'Only confirmed matches can be cancelled here'; END IF;

  _is_team := (_uid = _e.team_id);
  _first_day := _e.start_date;

  -- Determine grace window: within 24h of confirmation AND before first required day
  _is_grace := (_e.confirmed_at IS NOT NULL
                AND _now - _e.confirmed_at < interval '24 hours'
                AND _now::date < _first_day);

  IF _is_grace THEN
    _kind := 'grace';
  ELSIF _is_team THEN
    _kind := 'team_late';
  ELSE
    _kind := 'freelancer_late';
  END IF;

  UPDATE public.engagements
    SET status = 'cancelled',
        cancelled_at = _now,
        cancelled_by = _uid,
        cancellation_kind = _kind,
        cancellation_reason = _reason,
        updated_at = now()
    WHERE id = _engagement_id
    RETURNING * INTO _e;

  -- Notify the other party
  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (CASE WHEN _is_team THEN _e.freelancer_id ELSE _e.team_id END,
     'engagement_cancelled',
     jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id, 'kind', _kind, 'by_team', _is_team, 'reason', _reason));

  -- Reopen request except for team_late (which archives it)
  IF _e.request_id IS NOT NULL THEN
    SELECT * INTO _r FROM public.requests WHERE id = _e.request_id;
    IF _kind = 'team_late' THEN
      UPDATE public.requests SET status = 'completed', is_active = false, updated_at = now()
        WHERE id = _e.request_id;
    ELSE
      -- Reopen if still meaningful (first date hasn't passed by more than 1 day)
      IF _now::date <= _first_day THEN
        UPDATE public.requests SET status = 'active', is_active = true, updated_at = now()
          WHERE id = _e.request_id;
        -- Notify prior proposed candidates + top matches
        FOR _other IN
          SELECT DISTINCT m.freelancer_id
          FROM public.matches m
          WHERE m.request_id = _e.request_id
            AND m.freelancer_id <> _e.freelancer_id
          ORDER BY m.freelancer_id  -- (dedupe)
        LOOP
          INSERT INTO public.notifications(user_id, kind, payload) VALUES
            (_other.freelancer_id, 'match_reopened',
             jsonb_build_object('request_id', _e.request_id, 'reason', _kind));
        END LOOP;
      ELSE
        UPDATE public.requests SET status = 'completed', is_active = false, updated_at = now()
          WHERE id = _e.request_id;
      END IF;
    END IF;
  END IF;

  RETURN _e;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cancel_engagement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_engagement(uuid, text) TO authenticated;

-- 7. Team cancellation stats (public — used on team profile page)
CREATE OR REPLACE FUNCTION public.team_cancellation_stats(_team_id uuid)
 RETURNS TABLE(count integer, avg_days_notice numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    COUNT(*)::int,
    ROUND(AVG(GREATEST(0, (start_date - cancelled_at::date)))::numeric, 1)
  FROM public.engagements
  WHERE team_id = _team_id AND cancellation_kind = 'team_late';
$function$;
REVOKE EXECUTE ON FUNCTION public.team_cancellation_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_cancellation_stats(uuid) TO authenticated;

-- 8. Trigger SOS call
CREATE OR REPLACE FUNCTION public.trigger_sos_call(_request_id uuid)
 RETURNS public.sos_calls
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r public.requests%ROWTYPE;
  _now timestamptz := public.sim_now();
  _first_day date;
  _min_pct numeric;
  _anchor_lat numeric;
  _anchor_lng numeric;
  _tp public.team_profiles%ROWTYPE;
  _sos public.sos_calls%ROWTYPE;
  _row record;
  _cnt int := 0;
  _has_confirmed boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _r FROM public.requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _r.team_id <> _uid THEN RAISE EXCEPTION 'Not owner of request'; END IF;
  IF _r.duration = 'full_season' THEN RAISE EXCEPTION 'SOS Call is not available for full-season requests'; END IF;

  _first_day := _r.start_date;
  IF _now::date <> _first_day THEN
    RAISE EXCEPTION 'SOS Call is only available on the first required day (%). Today (sim) is %.', _first_day, _now::date;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.engagements WHERE request_id = _request_id AND status = 'confirmed') INTO _has_confirmed;
  IF _has_confirmed THEN RAISE EXCEPTION 'This request already has a confirmed match'; END IF;

  _min_pct := public.get_setting_num('sos_min_match_pct', 75);

  -- Determine geo anchor from request settings
  IF COALESCE(_r.location_anchor,'this') = 'team' THEN
    SELECT * INTO _tp FROM public.team_profiles WHERE user_id = _uid;
    _anchor_lat := _tp.location_lat;
    _anchor_lng := _tp.location_lng;
  ELSE
    _anchor_lat := _r.location_lat;
    _anchor_lng := _r.location_lng;
  END IF;

  INSERT INTO public.sos_calls(request_id, team_id, triggered_by, min_pct, radius_km)
    VALUES (_request_id, _uid, _uid, _min_pct::int, _r.location_radius_km)
    RETURNING * INTO _sos;

  FOR _row IN
    SELECT m.freelancer_id, m.id AS match_id, m.skills_score,
           public.haversine_km(fp.location_lat, fp.location_lng, _anchor_lat, _anchor_lng) AS dist_km
    FROM public.matches m
    JOIN public.freelancer_profiles fp ON fp.user_id = m.freelancer_id
    WHERE m.request_id = _request_id
      AND m.skills_score >= _min_pct
      AND EXISTS (
        SELECT 1 FROM public.availability a WHERE a.freelancer_id = m.freelancer_id AND a.day = _first_day
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.engagements e
        WHERE e.freelancer_id = m.freelancer_id
          AND e.status IN ('confirmed','proposed')
          AND _first_day BETWEEN e.start_date AND e.end_date
      )
  LOOP
    IF _r.location_radius_km IS NOT NULL AND _anchor_lat IS NOT NULL AND _anchor_lng IS NOT NULL
       AND _row.dist_km IS NOT NULL AND _row.dist_km > _r.location_radius_km THEN
      CONTINUE;
    END IF;
    INSERT INTO public.sos_call_targets(sos_id, freelancer_id, match_id, skills_score, distance_km)
      VALUES (_sos.id, _row.freelancer_id, _row.match_id, _row.skills_score, _row.dist_km)
      ON CONFLICT (sos_id, freelancer_id) DO NOTHING;
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_row.freelancer_id, 'sos_call',
       jsonb_build_object('sos_id', _sos.id, 'request_id', _request_id, 'first_day', _first_day));
    _cnt := _cnt + 1;
  END LOOP;

  UPDATE public.sos_calls SET target_count = _cnt WHERE id = _sos.id RETURNING * INTO _sos;
  RETURN _sos;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.trigger_sos_call(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_sos_call(uuid) TO authenticated;

-- 9. Accept SOS call
CREATE OR REPLACE FUNCTION public.accept_sos_call(_sos_id uuid)
 RETURNS public.engagements
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _sos public.sos_calls%ROWTYPE;
  _r public.requests%ROWTYPE;
  _target public.sos_call_targets%ROWTYPE;
  _e public.engagements%ROWTYPE;
  _other record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _sos FROM public.sos_calls WHERE id = _sos_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOS call not found'; END IF;
  IF _sos.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'SOS call already resolved'; END IF;

  SELECT * INTO _target FROM public.sos_call_targets WHERE sos_id = _sos_id AND freelancer_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'You are not an eligible target for this SOS'; END IF;

  SELECT * INTO _r FROM public.requests WHERE id = _sos.request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request no longer exists'; END IF;

  INSERT INTO public.engagements(
    freelancer_id, team_id, request_id, match_id, start_date, end_date,
    proposed_by, status, confirmed_at, currency
  ) VALUES (
    _uid, _sos.team_id, _sos.request_id, _target.match_id, _r.start_date, _r.end_date,
    _sos.team_id, 'confirmed', now(), 'EUR'
  ) RETURNING * INTO _e;

  UPDATE public.sos_calls SET resolved_at = now(), resolved_engagement_id = _e.id WHERE id = _sos_id;

  IF _target.match_id IS NOT NULL THEN
    INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
      VALUES (_sos.team_id, _target.match_id, _sos.request_id, _uid, true) ON CONFLICT DO NOTHING;
    UPDATE public.matches SET revealed_by_team = true, revealed_by_freelancer = true WHERE id = _target.match_id;
  END IF;

  INSERT INTO public.request_team_reveals(user_id, request_id) VALUES (_uid, _sos.request_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.team_reveals(user_id, team_id) VALUES (_uid, _sos.team_id) ON CONFLICT DO NOTHING;

  UPDATE public.requests SET status = 'filled', is_active = false, updated_at = now()
    WHERE id = _sos.request_id;

  -- Notify team + other SOS targets
  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_sos.team_id, 'engagement_confirmed',
     jsonb_build_object('engagement_id', _e.id, 'request_id', _sos.request_id, 'freelancer_id', _uid, 'via_sos', true));

  FOR _other IN
    SELECT freelancer_id FROM public.sos_call_targets WHERE sos_id = _sos_id AND freelancer_id <> _uid
  LOOP
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_other.freelancer_id, 'sos_taken', jsonb_build_object('sos_id', _sos_id, 'request_id', _sos.request_id));
  END LOOP;

  RETURN _e;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.accept_sos_call(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_sos_call(uuid) TO authenticated;

-- 10. Close expired requests (auto-archive)
CREATE OR REPLACE FUNCTION public.close_expired_requests()
 RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _now date := public.sim_now()::date;
  _cnt int := 0;
  _r record;
BEGIN
  FOR _r IN
    SELECT id, team_id, start_date FROM public.requests
    WHERE status IN ('active','paused')
      AND (
        (season_dates IS NULL AND start_date < _now) OR
        (season_dates IS NOT NULL AND (SELECT MIN(d) FROM unnest(season_dates) d) < _now)
      )
      AND NOT EXISTS (SELECT 1 FROM public.engagements e WHERE e.request_id = requests.id AND e.status = 'confirmed')
  LOOP
    UPDATE public.requests SET status = 'completed', is_active = false, updated_at = now() WHERE id = _r.id;
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_r.team_id, 'request_unfilled', jsonb_build_object('request_id', _r.id));
    _cnt := _cnt + 1;
  END LOOP;
  RETURN _cnt;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.close_expired_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_expired_requests() TO authenticated, service_role;

-- 11. Schedule via pg_cron (runs hourly)
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-expired-requests') THEN
    PERFORM cron.schedule('close-expired-requests', '15 * * * *', $cron$ SELECT public.close_expired_requests(); $cron$);
  END IF;
END $$;
