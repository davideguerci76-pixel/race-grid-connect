-- STEP 11.4A — FND-1 internal required-days authority + FND-2 match snapshot
-- Forward-only.

-- ---------------------------------------------------------------------------
-- FND-1: internal, non-client-callable required-days resolver.
-- public.request_required_days() keeps its caller gate (client-facing surface).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_required_days_internal(_request_id uuid)
RETURNS date[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _season_dates date[];
  _start_date date;
  _end_date date;
  _required_days date[];
BEGIN
  SELECT r.season_dates, r.start_date, r.end_date
    INTO _season_dates, _start_date, _end_date
  FROM public.requests r
  WHERE r.id = _request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not accessible';
  END IF;

  IF _season_dates IS NOT NULL AND cardinality(_season_dates) > 0 THEN
    SELECT ARRAY(SELECT DISTINCT d FROM unnest(_season_dates) AS d ORDER BY d)
      INTO _required_days;
  ELSE
    SELECT array_agg(d::date ORDER BY d::date) INTO _required_days
    FROM generate_series(_start_date, _end_date, interval '1 day') AS d;
  END IF;

  RETURN COALESCE(_required_days, ARRAY[]::date[]);
END;
$function$;

REVOKE ALL ON FUNCTION public.request_required_days_internal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_required_days_internal(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.request_required_days_internal(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.request_required_days_internal(uuid) TO service_role;

-- Rewire only the server-authoritative, non-client-callable callers.
DO $rewire$
DECLARE
  _oid oid;
  _def text;
BEGIN
  FOR _oid IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('recompute_matches',
                        'emit_availability_opportunity_notifications',
                        'request_missing_required_days')
  LOOP
    _def := pg_get_functiondef(_oid);
    _def := replace(_def, 'public.request_required_days(', 'public.request_required_days_internal(');
    EXECUTE _def;
  END LOOP;
END;
$rewire$;

-- ---------------------------------------------------------------------------
-- FND-3: a match already crystallised into a confirmed/completed engagement is
-- history; recompute must not stale it out of the Match views.
-- ---------------------------------------------------------------------------
DO $keep$
DECLARE
  _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'recompute_matches';

  _def := replace(
    _def,
    '  UPDATE public.matches SET stale = true
    WHERE (_freelancer_id IS NULL OR freelancer_id = _freelancer_id)
      AND (_request_id IS NULL OR request_id = _request_id)
      AND stale = false;',
    '  UPDATE public.matches m SET stale = true
    WHERE (_freelancer_id IS NULL OR m.freelancer_id = _freelancer_id)
      AND (_request_id IS NULL OR m.request_id = _request_id)
      AND m.stale = false
      AND NOT EXISTS (
        SELECT 1 FROM public.engagements e
        WHERE e.request_id = m.request_id
          AND e.freelancer_id = m.freelancer_id
          AND e.status IN (''confirmed'', ''completed'')
      );'
  );

  IF _def NOT LIKE '%UPDATE public.matches m SET stale = true%' THEN
    RAISE EXCEPTION 'FND-3 patch did not apply to recompute_matches';
  END IF;

  EXECUTE _def;
END;
$keep$;

-- ---------------------------------------------------------------------------
-- FND-2: minimum sufficient professional snapshot on the proposed engagement.
-- ---------------------------------------------------------------------------
ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS match_snapshot jsonb;

COMMENT ON COLUMN public.engagements.match_snapshot IS
  'Immutable photograph of the match at Request Match Confirmation time. Server-authoritative.';

CREATE OR REPLACE FUNCTION public.tg_engagement_snapshot_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user IN ('authenticated', 'anon') AND NEW.match_snapshot IS NOT NULL THEN
      RAISE EXCEPTION 'Engagement match snapshot is server-authoritative';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.match_snapshot IS NOT NULL AND NEW.match_snapshot IS DISTINCT FROM OLD.match_snapshot THEN
    RAISE EXCEPTION 'Engagement match snapshot is immutable';
  END IF;
  IF OLD.match_snapshot IS NULL
     AND NEW.match_snapshot IS NOT NULL
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Engagement match snapshot is server-authoritative';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS engagement_snapshot_immutable ON public.engagements;
CREATE TRIGGER engagement_snapshot_immutable
BEFORE INSERT OR UPDATE ON public.engagements
FOR EACH ROW EXECUTE FUNCTION public.tg_engagement_snapshot_immutable();

-- Builder: derives the snapshot exclusively from server-side rows.
CREATE OR REPLACE FUNCTION public.build_match_snapshot(_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _m public.matches%ROWTYPE;
  _fp public.freelancer_profiles%ROWTYPE;
  _required integer;
BEGIN
  SELECT * INTO _m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO _fp FROM public.freelancer_profiles WHERE user_id = _m.freelancer_id;

  _required := COALESCE(array_length(public.request_required_days_internal(_m.request_id), 1), 0);

  RETURN jsonb_build_object(
    'version', 1,
    'taken_at', now(),
    'match_id', _m.id,
    'scores', jsonb_build_object(
      'skills_score', _m.skills_score,
      'final_score', _m.final_score,
      'match_score', _m.match_score,
      'is_perfect', _m.is_perfect,
      'relevance_threshold', COALESCE(public.get_setting_num('professional_relevance_threshold', 50), 50)
    ),
    'coverage', jsonb_build_object(
      'required_days', _required,
      'overlap_days', _m.overlap_days,
      'missing_days', _m.missing_days,
      'missing_pct', _m.missing_pct,
      'is_partial', _m.is_partial,
      'edge_only', _m.edge_only
    ),
    'missing_criteria', COALESCE(_m.missing_criteria, '[]'::jsonb),
    'profile', jsonb_build_object(
      'role_group', _fp.role_group,
      'sub_roles', COALESCE(_fp.sub_roles, '[]'::jsonb),
      'skills', to_jsonb(COALESCE(_fp.skills, '{}')),
      'disciplines', to_jsonb(COALESCE(_fp.disciplines, '{}')),
      'languages', COALESCE(_fp.languages, '[]'::jsonb),
      'experiences', COALESCE(_fp.experiences, '[]'::jsonb),
      'education', _fp.education,
      'travels', COALESCE(_fp.travels, false),
      'years_experience', _fp.years_experience,
      'day_rate', _fp.day_rate,
      'headline', _fp.headline,
      'location_city', _fp.location_city,
      'location_region', _fp.location_region,
      'location_country', _fp.location_country
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.build_match_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.build_match_snapshot(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.build_match_snapshot(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.build_match_snapshot(uuid) TO service_role;

-- Crystallisation point: the Team's Request Match Confirmation.
CREATE OR REPLACE FUNCTION public.request_match_confirmation(_match_id uuid)
RETURNS engagements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _m public.matches%ROWTYPE;
  _r public.requests%ROWTYPE;
  _existing public.engagements%ROWTYPE;
  _new public.engagements%ROWTYPE;
  _required_days date[];
  _work_days date[];
  _start_ts timestamptz;
  _expires timestamptz;
  _snapshot jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _m.team_id <> _uid THEN RAISE EXCEPTION 'Not owner of this match'; END IF;

  SELECT * INTO _r FROM public.requests WHERE id = _m.request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_m.freelancer_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(_m.request_id::text || ':' || _m.freelancer_id::text, 0));

  -- Re-read the match under the lock: the snapshot must reflect the row as it
  -- stands at crystallisation time, not the pre-lock read (TOCTOU).
  SELECT * INTO _m FROM public.matches WHERE id = _match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _m.team_id <> _uid THEN RAISE EXCEPTION 'Not owner of this match'; END IF;

  SELECT * INTO _existing FROM public.engagements
    WHERE freelancer_id = _m.freelancer_id
      AND request_id = _m.request_id
      AND status IN ('proposed','confirmed','completed')
    LIMIT 1;
  IF FOUND THEN RETURN _existing; END IF;

  IF EXISTS (
    SELECT 1 FROM public.engagements
    WHERE freelancer_id = _m.freelancer_id AND request_id = _m.request_id
      AND status = 'cancelled' AND cancellation_kind IN ('freelancer_declined','expired')
  ) THEN
    RAISE EXCEPTION 'This match request was already declined or expired for this freelancer';
  END IF;

  IF _r.status = 'filled' THEN RAISE EXCEPTION 'Request already filled'; END IF;
  IF _r.status IN ('closed','completed') OR _r.is_active = false THEN
    RAISE EXCEPTION 'This Pit Call is no longer open';
  END IF;

  _required_days := public.request_required_days(_r.id);

  SELECT array_agg(a.day ORDER BY a.day) INTO _work_days
  FROM public.availability a
  WHERE a.freelancer_id = _m.freelancer_id
    AND a.day = ANY(coalesce(_required_days, ARRAY[]::date[]))
    AND NOT public.day_blocked_by_engagement(_m.freelancer_id, a.day);

  IF _work_days IS NULL OR cardinality(_work_days) = 0 THEN
    RAISE EXCEPTION 'Freelancer has no available days for this match';
  END IF;

  _start_ts := public.request_start_ts(_r.id);
  _expires := now() + interval '48 hours';
  IF _start_ts IS NOT NULL AND _start_ts > now() AND _start_ts < _expires THEN
    _expires := _start_ts;
  END IF;

  _snapshot := public.build_match_snapshot(_m.id);

  INSERT INTO public.engagements(
    freelancer_id, team_id, request_id, match_id,
    start_date, end_date, fee, currency, proposed_by, status, notes, expires_at, covered_days,
    match_snapshot
  ) VALUES (
    _m.freelancer_id, _m.team_id, _m.request_id, _m.id,
    _work_days[1], _work_days[cardinality(_work_days)], _r.budget_max, 'EUR', _uid, 'proposed',
    'Confirmation requested by team for "' || _r.title || '"', _expires, _work_days,
    _snapshot
  ) RETURNING * INTO _new;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_m.freelancer_id, 'engagement_proposed',
     jsonb_build_object('engagement_id', _new.id, 'request_id', _r.id, 'request_title', _r.title,
                        'expires_at', _expires));

  RETURN _new;
END;
$function$;