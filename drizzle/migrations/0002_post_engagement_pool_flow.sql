-- 1. Auto-complete engagements after their end date
CREATE OR REPLACE FUNCTION public.complete_expired_engagements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cnt int := 0;
  _r record;
BEGIN
  FOR _r IN
    SELECT id, freelancer_id, team_id
    FROM public.engagements
    WHERE status = 'confirmed'
      AND end_date < public.sim_now()::date
  LOOP
    UPDATE public.engagements
      SET status = 'completed',
          freelancer_marked_complete = true,
          team_marked_complete = true,
          updated_at = now()
    WHERE id = _r.id;

    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = _r.freelancer_id AND kind = 'engagement_completed'
        AND (payload->>'engagement_id')::uuid = _r.id
    ) THEN
      INSERT INTO public.notifications(user_id, kind, payload)
      VALUES (_r.freelancer_id, 'engagement_completed', jsonb_build_object('engagement_id', _r.id));
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = _r.team_id AND kind = 'engagement_completed'
        AND (payload->>'engagement_id')::uuid = _r.id
    ) THEN
      INSERT INTO public.notifications(user_id, kind, payload)
      VALUES (_r.team_id, 'engagement_completed', jsonb_build_object('engagement_id', _r.id));
    END IF;

    _cnt := _cnt + 1;
  END LOOP;
  RETURN _cnt;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.complete_expired_engagements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_expired_engagements() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('complete-expired-engagements')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'complete-expired-engagements');
    PERFORM cron.schedule('complete-expired-engagements', '20 * * * *', $cron$ SELECT public.complete_expired_engagements(); $cron$);
  END IF;
END $$;

-- 2. No more automatic pool add on completion
DROP TRIGGER IF EXISTS pool_on_engagement_complete ON public.engagements;

-- 3. Owner-scoped manual add to pool from a real engagement (never creates an engagement/rating)
CREATE OR REPLACE FUNCTION public.add_pool_member_from_engagement(_engagement_id uuid)
RETURNS public.team_pool
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
  _row public.team_pool;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Engagement not found'; END IF;
  IF _e.team_id <> _uid THEN RAISE EXCEPTION 'Not owner of this engagement'; END IF;
  IF _e.status NOT IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'Engagement not completed';
  END IF;

  INSERT INTO public.team_pool(team_id, freelancer_id, source, engagement_id)
  VALUES (_uid, _e.freelancer_id, 'engagement', _e.id)
  ON CONFLICT (team_id, freelancer_id) DO NOTHING;

  SELECT * INTO _row FROM public.team_pool WHERE team_id = _uid AND freelancer_id = _e.freelancer_id;
  RETURN _row;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.add_pool_member_from_engagement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_pool_member_from_engagement(uuid) TO authenticated, service_role;

-- 4. Add by pit code: only create the pool engagement/rating when the two parties never worked together
CREATE OR REPLACE FUNCTION public.add_pool_member_by_code(_code text)
RETURNS public.team_pool
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _f uuid;
  _eng uuid;
  _row public.team_pool;
  _has_history boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND user_type = 'team') THEN
    RAISE EXCEPTION 'Only teams have a pool';
  END IF;

  SELECT user_id INTO _f FROM public.freelancer_profiles
  WHERE upper(pit_code) = upper(btrim(_code));
  IF _f IS NULL THEN RAISE EXCEPTION 'No freelancer found for this code'; END IF;

  SELECT id INTO _row.id FROM public.team_pool WHERE team_id = _uid AND freelancer_id = _f;
  IF _row.id IS NOT NULL THEN
    SELECT * INTO _row FROM public.team_pool WHERE id = _row.id;
    RETURN _row;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.engagements
    WHERE team_id = _uid AND freelancer_id = _f
      AND status IN ('confirmed', 'completed')
  ) INTO _has_history;

  IF _has_history THEN
    INSERT INTO public.team_pool(team_id, freelancer_id, source)
    VALUES (_uid, _f, 'code')
    ON CONFLICT (team_id, freelancer_id) DO UPDATE SET source = 'code'
    RETURNING * INTO _row;
    RETURN _row;
  END IF;

  INSERT INTO public.engagements(freelancer_id, team_id, start_date, end_date, proposed_by, status, notes,
                                 freelancer_marked_complete, team_marked_complete, confirmed_at)
  VALUES (_f, _uid, (public.sim_now()::date - 1), (public.sim_now()::date - 1), _uid, 'completed', 'pool_manual',
          true, true, now())
  RETURNING id INTO _eng;

  INSERT INTO public.team_pool(team_id, freelancer_id, source, engagement_id)
  VALUES (_uid, _f, 'code', _eng)
  ON CONFLICT (team_id, freelancer_id) DO UPDATE SET source = 'code'
  RETURNING * INTO _row;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_f, 'rating_available', jsonb_build_object('engagement_id', _eng, 'pool', true)),
    (_uid, 'rating_available', jsonb_build_object('engagement_id', _eng, 'pool', true));

  RETURN _row;
END;
$function$;