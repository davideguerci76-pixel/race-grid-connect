-- STEP 7 lock-check blockers: keep RED refund eligibility tied to the immutable initial band/history,
-- and renew the server-authoritative review deadline after each meaningful MODIFY.

CREATE OR REPLACE FUNCTION public.modify_request(_request_id uuid, _payload jsonb)
RETURNS public.requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r public.requests%ROWTYPE;
  _before jsonb;
  _after jsonb;
  _max_modify integer;
  _budget_left integer;
  _season_dates date[] := NULL;
  _skills text[];
  _skills_hard text[];
  _education text[];
  _experience_reqs jsonb;
  _languages jsonb;
  _start date;
  _end date;
  _loc_relevance text;
  _loc_anchor text;
  _sub_level text;
  _match_count integer := 0;
  _post_review_minutes integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text, 7));
  SELECT * INTO _r FROM public.requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _r.team_id <> _uid THEN RAISE EXCEPTION 'Not owner of this Pit Call'; END IF;
  IF _r.status <> 'pending_review' THEN
    RAISE EXCEPTION 'This Pit Call can only be modified during its review window';
  END IF;
  IF _r.review_deadline_at IS NOT NULL AND now() >= _r.review_deadline_at THEN
    RAISE EXCEPTION 'The review window for this Pit Call has ended';
  END IF;

  _max_modify := GREATEST(0, COALESCE(public.get_setting_num('max_modify_per_pitcall', 3), 3)::int);
  IF _r.modify_count >= _max_modify THEN
    RAISE EXCEPTION 'MODIFY_LIMIT_REACHED';
  END IF;

  _budget_left := public.team_recheck_budget_left(_uid);
  IF _budget_left < 1 THEN
    RAISE EXCEPTION 'RECHECK_BUDGET_EXHAUSTED';
  END IF;

  _before := public.request_matching_fingerprint(_request_id);

  _sub_level := COALESCE(NULLIF(_payload->>'sub_role_min_level',''), _r.sub_role_min_level, 'junior');
  IF _sub_level NOT IN ('junior','intermediate','senior') THEN _sub_level := 'junior'; END IF;

  _loc_relevance := COALESCE(NULLIF(_payload->>'location_relevance',''), _r.location_relevance, 'not_relevant');
  IF _loc_relevance NOT IN ('not_relevant','relevant','mandatory') THEN _loc_relevance := 'not_relevant'; END IF;
  _loc_anchor := COALESCE(NULLIF(_payload->>'location_anchor',''), _r.location_anchor, 'this');
  IF _loc_anchor NOT IN ('this','team') THEN _loc_anchor := 'this'; END IF;

  IF _payload ? 'season_dates' AND jsonb_typeof(_payload->'season_dates') = 'array' THEN
    SELECT ARRAY(
      SELECT DISTINCT (value #>> '{}')::date AS d
      FROM jsonb_array_elements(_payload->'season_dates')
      ORDER BY d
    ) INTO _season_dates;
    IF array_length(_season_dates, 1) IS NULL THEN _season_dates := NULL; END IF;
  ELSE
    _season_dates := _r.season_dates;
  END IF;

  IF _payload ? 'skills' AND jsonb_typeof(_payload->'skills') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::text FROM jsonb_array_elements(_payload->'skills')) INTO _skills;
  ELSE
    _skills := _r.skills;
  END IF;
  IF _payload ? 'skills_hard' AND jsonb_typeof(_payload->'skills_hard') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::text FROM jsonb_array_elements(_payload->'skills_hard')) INTO _skills_hard;
  ELSE
    _skills_hard := _r.skills_hard;
  END IF;
  IF _payload ? 'education' AND jsonb_typeof(_payload->'education') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::text FROM jsonb_array_elements(_payload->'education')) INTO _education;
  ELSE
    _education := _r.education;
  END IF;
  _experience_reqs := CASE
    WHEN _payload ? 'experience_requirements' AND jsonb_typeof(_payload->'experience_requirements') = 'array'
      THEN _payload->'experience_requirements'
    ELSE _r.experience_requirements END;
  _languages := CASE
    WHEN _payload ? 'languages' AND jsonb_typeof(_payload->'languages') = 'array'
      THEN _payload->'languages'
    ELSE _r.languages END;

  IF _season_dates IS NOT NULL AND array_length(_season_dates, 1) > 0 THEN
    SELECT MIN(d), MAX(d) INTO _start, _end FROM unnest(_season_dates) d;
  ELSE
    _start := COALESCE(NULLIF(_payload->>'start_date','')::date, _r.start_date);
    _end := COALESCE(NULLIF(_payload->>'end_date','')::date, _r.end_date);
  END IF;
  IF _end < _start THEN RAISE EXCEPTION 'End date cannot be earlier than the start date'; END IF;

  IF _r.duration = 'full_season' AND (_season_dates IS NULL OR array_length(_season_dates, 1) IS NULL) THEN
    RAISE EXCEPTION 'Full season Pit Calls require at least one selected day';
  END IF;

  UPDATE public.requests SET
    title = COALESCE(NULLIF(_payload->>'title',''), title),
    role_group = COALESCE(NULLIF(_payload->>'role_group',''), role_group),
    sub_role = CASE WHEN _payload ? 'sub_role' THEN NULLIF(_payload->>'sub_role','') ELSE sub_role END,
    sub_role_min_level = _sub_level,
    sub_role_hard = COALESCE((_payload->>'sub_role_hard')::boolean, sub_role_hard),
    discipline = COALESCE(NULLIF(_payload->>'discipline','')::public.discipline, discipline),
    circuit = CASE WHEN _payload ? 'circuit' THEN NULLIF(_payload->>'circuit','') ELSE circuit END,
    location = CASE WHEN _payload ? 'location' THEN NULLIF(_payload->>'location','') ELSE location END,
    start_date = _start,
    end_date = _end,
    season_dates = _season_dates,
    budget_min = CASE WHEN _payload ? 'budget_min' THEN NULLIF(_payload->>'budget_min','')::integer ELSE budget_min END,
    budget_max = CASE WHEN _payload ? 'budget_max' THEN NULLIF(_payload->>'budget_max','')::integer ELSE budget_max END,
    budget_unit = COALESCE(NULLIF(_payload->>'budget_unit',''), budget_unit),
    notes = CASE WHEN _payload ? 'notes' THEN NULLIF(_payload->>'notes','') ELSE notes END,
    skills = COALESCE(_skills, '{}'),
    skills_hard = COALESCE(_skills_hard, '{}'),
    education = COALESCE(_education, '{}'),
    experience_requirements = COALESCE(_experience_reqs, '[]'::jsonb),
    languages = COALESCE(_languages, '[]'::jsonb),
    travel_required = COALESCE((_payload->>'travel_required')::boolean, travel_required),
    location_lat = CASE WHEN _payload ? 'location_lat' THEN NULLIF(_payload->>'location_lat','')::numeric ELSE location_lat END,
    location_lng = CASE WHEN _payload ? 'location_lng' THEN NULLIF(_payload->>'location_lng','')::numeric ELSE location_lng END,
    location_city = CASE WHEN _payload ? 'location_city' THEN NULLIF(_payload->>'location_city','') ELSE location_city END,
    location_region = CASE WHEN _payload ? 'location_region' THEN NULLIF(_payload->>'location_region','') ELSE location_region END,
    location_country = CASE WHEN _payload ? 'location_country' THEN NULLIF(_payload->>'location_country','') ELSE location_country END,
    location_place_id = CASE WHEN _payload ? 'location_place_id' THEN NULLIF(_payload->>'location_place_id','') ELSE location_place_id END,
    location_relevance = _loc_relevance,
    location_anchor = _loc_anchor,
    location_radius_km = CASE WHEN _payload ? 'location_radius_km' THEN NULLIF(_payload->>'location_radius_km','')::integer ELSE location_radius_km END,
    updated_at = now()
  WHERE id = _request_id
  RETURNING * INTO _r;

  _after := public.request_matching_fingerprint(_request_id);

  IF _after IS DISTINCT FROM _before THEN
    INSERT INTO public.request_recheck_ledger(team_id, request_id, units, kind)
      VALUES (_uid, _request_id, 1, 'modify');

    _match_count := public.recompute_matches(NULL, _request_id);
    _post_review_minutes := GREATEST(0, COALESCE(public.get_setting_num('post_review_window_minutes', 5), 5)::int);

    UPDATE public.requests
       SET modify_count = modify_count + 1,
           last_modified_at = now(),
           match_potential_current = public.classify_match_potential(_match_count),
           review_deadline_at = now() + (_post_review_minutes || ' minutes')::interval,
           updated_at = now()
     WHERE id = _request_id
     RETURNING * INTO _r;
  END IF;

  RETURN _r;
END;
$function$;

REVOKE ALL ON FUNCTION public.modify_request(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.modify_request(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.red_cancel_request(_request_id uuid)
RETURNS TABLE(refund_tokens integer, balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r public.requests%ROWTYPE;
  _spent integer := 0;
  _new_bal integer;
  _budget_cost integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text, 7));
  SELECT * INTO _r FROM public.requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _r.team_id <> _uid THEN RAISE EXCEPTION 'Not owner of this Pit Call'; END IF;
  IF _r.red_cancelled_at IS NOT NULL OR _r.refund_kind IS NOT NULL OR _r.partial_refund_taken THEN
    RAISE EXCEPTION 'A refund has already been granted for this Pit Call';
  END IF;
  IF _r.status <> 'pending_review' THEN
    RAISE EXCEPTION 'RED cancel is only available during the review window';
  END IF;
  IF _r.review_deadline_at IS NOT NULL AND now() >= _r.review_deadline_at THEN
    RAISE EXCEPTION 'The review window for this Pit Call has ended';
  END IF;

  -- A refund is allowed only when the immutable initial band was RED and the
  -- request has never produced a Full or Partial match. A later RED state is
  -- not sufficient after a stronger initial result or a prior match.
  IF COALESCE(_r.initial_match_potential, '') <> 'red'
     OR COALESCE(_r.ever_full_matched, false)
     OR COALESCE(_r.ever_partial_matched, false)
     OR COALESCE(_r.match_potential_current, '') <> 'red' THEN
    RAISE EXCEPTION 'RED_CANCEL_NOT_ELIGIBLE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE request_id = _request_id AND stale = false)
     OR EXISTS (SELECT 1 FROM public.engagements WHERE request_id = _request_id
                  AND status IN ('proposed','confirmed','completed')) THEN
    RAISE EXCEPTION 'RED_CANCEL_NOT_ELIGIBLE';
  END IF;

  SELECT COALESCE(SUM(-delta), 0)::int INTO _spent
  FROM public.token_transactions
  WHERE user_id = _uid AND ref_id = _request_id AND reason = 'request_post';

  IF _spent > 0 THEN
    _new_bal := public.credit_tokens(_uid, _spent, 'refund'::public.token_reason, _request_id,
      'RED cancel — 100% token return');
  ELSE
    SELECT token_balance INTO _new_bal FROM public.profiles WHERE id = _uid;
  END IF;

  _budget_cost := GREATEST(0, COALESCE(public.get_setting_num('red_cancel_budget_cost', 2), 2)::int);
  IF _budget_cost > 0 THEN
    INSERT INTO public.request_recheck_ledger(team_id, request_id, units, kind)
      VALUES (_uid, _request_id, _budget_cost, 'red_cancel');
  END IF;

  UPDATE public.requests
     SET status = 'closed',
         is_active = false,
         red_cancelled_at = now(),
         red_cancel_tokens = _spent,
         refund_kind = 'red_cancel',
         refund_tokens = _spent,
         refund_pct = 100,
         partial_refund_taken = true,
         review_deadline_at = NULL,
         updated_at = now()
   WHERE id = _request_id;

  RETURN QUERY SELECT _spent, _new_bal;
END;
$function$;

REVOKE ALL ON FUNCTION public.red_cancel_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.red_cancel_request(uuid) TO authenticated, service_role;