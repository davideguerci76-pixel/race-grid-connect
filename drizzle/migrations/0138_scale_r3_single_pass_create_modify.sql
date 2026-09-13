-- SCALE-R3 / STEP C + D — C-2 modify_request single pass, C-1 create_request single pass, OBS-5 (b).
-- Mechanism: transaction-local flag pitcall.skip_request_recompute read by tg_recompute_on_request.
-- create_request: 3-6 recompute -> 1 (explicit, after the row is in pending_review). No freelancer new_matches
--   during pending_review; they are emitted by the activation UPDATE (activate_request_now / activate_request_if_due /
--   auto_activate_pending_reviews_env), whose trigger path is unchanged.
-- modify_request: 3 recompute -> 1 (explicit, only when the matching fingerprint changed).
-- Engine, activation functions, tokens, refunds, ledger, review deadline, RLS: UNCHANGED.
-- ROLLBACK: previous bodies in /mnt/documents/uat-scale-01/rollback/{tg_recompute_on_request,create_request,modify_request}.sql

CREATE OR REPLACE FUNCTION public.tg_recompute_on_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_matches(NULL, OLD.id);
    RETURN OLD;
  END IF;

  -- SCALE-R3 (C-1/C-2): create_request / modify_request run exactly one explicit pass themselves and
  -- suppress this trigger for the duration of their transaction-local flag.
  IF COALESCE(current_setting('pitcall.skip_request_recompute', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  -- The current coverage band is derived FROM the matches; refreshing it must
  -- never trigger another matching pass (that recursion timed out the statement).
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'match_potential_current' - 'updated_at')
       = (to_jsonb(OLD) - 'match_potential_current' - 'updated_at') THEN
    RETURN NEW;
  END IF;

  PERFORM public.recompute_matches(NULL, NEW.id);
  PERFORM public.emit_potential_match_notifications(NULL, NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_request(_payload jsonb)
 RETURNS requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _bal integer;
  _new public.requests%ROWTYPE;
  _duration public.duration_type;
  _cost integer;
  _season_dates date[] := NULL;
  _skills text[] := '{}';
  _skills_hard text[] := '{}';
  _education text[] := '{}';
  _experience_reqs jsonb := '[]'::jsonb;
  _languages jsonb := '[]'::jsonb;
  _start date;
  _end date;
  _travel_required boolean;
  _repost_of uuid;
  _source_ok boolean := false;
  _loc_relevance text;
  _loc_anchor text;
  _loc_radius integer;
  _loc_lat numeric;
  _loc_lng numeric;
  _role_group text;
  _sub_role text;
  _sub_level text;
  _sub_hard boolean;
  _search_mode text;
  _post_review_minutes integer;
  _match_count integer := 0;
  _potential text;
  _idem text := NULLIF(_payload->>'idempotency_key', '');
  _existing public.requests%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Launch gate (UAT-LAUNCH-02): LIVE follows the ACP toggle, TEST/DEMO always allowed.
  IF NOT public.pitcall_creation_allowed() THEN
    RAISE EXCEPTION 'pitcall_creation_disabled';
  END IF;

  -- Action idempotency: all concurrent calls belonging to the same publish
  -- attempt collapse onto one Pit Call and one charge. Content identity is not
  -- considered: a new attempt with identical content is always allowed.
  IF _idem IS NOT NULL THEN
    IF length(_idem) > 100 THEN RAISE EXCEPTION 'Invalid idempotency key'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('create-request:' || _uid::text || ':' || _idem, 0));
    SELECT * INTO _existing FROM public.requests
      WHERE team_id = _uid AND idempotency_key = _idem
      LIMIT 1;
    IF FOUND THEN RETURN _existing; END IF;
  END IF;

  _duration := COALESCE((_payload->>'duration')::public.duration_type, 'race_weekend'::public.duration_type);
  _cost := CASE WHEN _duration = 'full_season'
                  THEN public.get_setting_num('cost_request_full_season', 15)::int
                ELSE public.get_setting_num('cost_request_race_weekend', 5)::int END;
  _travel_required := COALESCE((_payload->>'travel_required')::boolean, true);

  _role_group := NULLIF(_payload->>'role_group','');
  _sub_role := NULLIF(_payload->>'sub_role','');
  _sub_level := COALESCE(NULLIF(_payload->>'sub_role_min_level',''), 'junior');
  IF _sub_level NOT IN ('junior','intermediate','senior') THEN _sub_level := 'junior'; END IF;
  _sub_hard := COALESCE((_payload->>'sub_role_hard')::boolean, false);
  IF _role_group IS NULL THEN RAISE EXCEPTION 'A macro-role is required'; END IF;

  _loc_relevance := COALESCE(NULLIF(_payload->>'location_relevance',''), 'not_relevant');
  IF _loc_relevance NOT IN ('not_relevant','relevant','mandatory') THEN _loc_relevance := 'not_relevant'; END IF;
  _loc_anchor := COALESCE(NULLIF(_payload->>'location_anchor',''), 'this');
  IF _loc_anchor NOT IN ('this','team') THEN _loc_anchor := 'this'; END IF;
  _loc_radius := NULLIF(_payload->>'location_radius_km','')::int;
  _loc_lat := NULLIF(_payload->>'location_lat','')::numeric;
  _loc_lng := NULLIF(_payload->>'location_lng','')::numeric;

  _search_mode := COALESCE(NULLIF(_payload->>'search_mode',''), 'standard');
  IF _search_mode NOT IN ('standard','pool') THEN _search_mode := 'standard'; END IF;

  IF _payload ? 'repost_of' AND length(_payload->>'repost_of') > 0 THEN
    _repost_of := (_payload->>'repost_of')::uuid;
    SELECT true INTO _source_ok FROM public.requests
      WHERE id = _repost_of AND team_id = _uid
        AND status IN ('completed','filled','closed');
    IF COALESCE(_source_ok, false) THEN
      _cost := CASE WHEN _duration = 'full_season'
                      THEN public.get_setting_num('cost_repost_identical_full_season', 10)::int
                    ELSE public.get_setting_num('cost_repost_identical_race_weekend', 3)::int END;
    END IF;
  END IF;

  IF _search_mode = 'pool' AND COALESCE(_source_ok, false) = false THEN
    _cost := public.get_setting_num('cost_pool_search', 5)::int;
  END IF;

  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < _cost THEN
    RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal, 0);
  END IF;

  IF _payload ? 'season_dates' AND jsonb_typeof(_payload->'season_dates') = 'array' THEN
    SELECT ARRAY(
      SELECT DISTINCT (value #>> '{}')::date AS d
      FROM jsonb_array_elements(_payload->'season_dates')
      ORDER BY d
    ) INTO _season_dates;
    IF array_length(_season_dates, 1) IS NULL THEN _season_dates := NULL; END IF;
  END IF;
  IF _payload ? 'skills' AND jsonb_typeof(_payload->'skills') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::text FROM jsonb_array_elements(_payload->'skills')) INTO _skills;
  END IF;
  IF _payload ? 'skills_hard' AND jsonb_typeof(_payload->'skills_hard') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::text FROM jsonb_array_elements(_payload->'skills_hard')) INTO _skills_hard;
  END IF;
  IF _payload ? 'education' AND jsonb_typeof(_payload->'education') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::text FROM jsonb_array_elements(_payload->'education')) INTO _education;
  END IF;
  IF _payload ? 'experience_requirements' AND jsonb_typeof(_payload->'experience_requirements') = 'array' THEN
    _experience_reqs := _payload->'experience_requirements';
  END IF;
  IF _payload ? 'languages' AND jsonb_typeof(_payload->'languages') = 'array' THEN
    _languages := _payload->'languages';
  END IF;

  IF _duration = 'full_season' AND (_season_dates IS NULL OR array_length(_season_dates, 1) IS NULL) THEN
    RAISE EXCEPTION 'Full season requests require at least one selected day';
  END IF;

  IF _season_dates IS NOT NULL AND array_length(_season_dates, 1) > 0 THEN
    SELECT MIN(d), MAX(d) INTO _start, _end FROM unnest(_season_dates) d;
  ELSE
    _start := (_payload->>'start_date')::date;
    _end := (_payload->>'end_date')::date;
  END IF;

  -- SCALE-R3 (C-1): single matching pass. Suppress the row-level recompute trigger for the whole RPC;
  -- the ONLY pass is the explicit one below, executed once the row is already in pending_review.
  PERFORM set_config('pitcall.skip_request_recompute', '1', true);

  INSERT INTO public.requests(
    team_id, title, discipline, duration,
    circuit, location, start_date, end_date,
    budget_min, budget_max, budget_unit, notes, season_dates, skills, skills_hard, education,
    experience_requirements, languages, role_hard, travel_required,
    location_lat, location_lng, location_relevance, location_anchor, location_radius_km,
    role_group, sub_role, sub_role_min_level, sub_role_hard, search_mode,
    idempotency_key, repost_identical, repost_source_id
  ) VALUES (
    _uid,
    _payload->>'title',
    (_payload->>'discipline')::public.discipline,
    _duration,
    NULLIF(_payload->>'circuit',''),
    NULLIF(_payload->>'location',''),
    _start, _end,
    NULLIF(_payload->>'budget_min','')::integer,
    NULLIF(_payload->>'budget_max','')::integer,
    COALESCE(_payload->>'budget_unit','day'),
    NULLIF(_payload->>'notes',''),
    _season_dates,
    _skills, _skills_hard, _education,
    _experience_reqs, _languages,
    true, _travel_required,
    _loc_lat, _loc_lng, _loc_relevance, _loc_anchor, _loc_radius,
    _role_group, _sub_role, _sub_level, _sub_hard, _search_mode,
    _idem,
    (COALESCE(_source_ok, false) AND _repost_of IS NOT NULL),
    CASE WHEN COALESCE(_source_ok, false) THEN _repost_of ELSE NULL END
  ) RETURNING * INTO _new;

  UPDATE public.profiles SET token_balance = token_balance - _cost WHERE id = _uid;
  INSERT INTO public.token_transactions(user_id, delta, reason, ref_id)
    VALUES (_uid, -_cost, 'request_post', _new.id);

  IF _search_mode = 'pool' THEN
    INSERT INTO public.pool_search_unlocks(team_id, request_id, tokens_spent)
      VALUES (_uid, _new.id, _cost)
      ON CONFLICT (team_id, request_id) DO NOTHING;
  END IF;

  -- SCALE-R3 (C-1): enter the server-authoritative post-review window FIRST (trigger suppressed),
  -- then run the single matching pass and freeze the initial band. The candidate set already includes
  -- pending_review requests (0103), so the result is identical to the pre-R3 active-time pass.
  -- Freelancer new_matches are NOT emitted here (OBS-5): they are emitted by the activation UPDATE.
  _post_review_minutes := GREATEST(0, COALESCE(public.get_setting_num('post_review_window_minutes', 5), 5)::int);
  UPDATE public.requests
     SET status = 'pending_review',
         is_active = false,
         review_deadline_at = now() + (_post_review_minutes || ' minutes')::interval,
         activated_at = NULL,
         updated_at = now()
   WHERE id = _new.id;

  _match_count := public.recompute_matches(NULL, _new.id);
  _potential := public.classify_match_potential(_match_count);
  UPDATE public.requests
     SET initial_match_potential = _potential,
         match_potential_current = _potential,
         updated_at = now()
   WHERE id = _new.id
   RETURNING * INTO _new;

  PERFORM set_config('pitcall.skip_request_recompute', '', true);
  RETURN _new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.modify_request(_request_id uuid, _payload jsonb)
 RETURNS requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  -- SCALE-R3 (C-2): single matching pass; the row-level trigger is suppressed for this RPC and the
  -- only recompute is the explicit one below, executed when the matching fingerprint changed.
  PERFORM set_config('pitcall.skip_request_recompute', '1', true);

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

  PERFORM set_config('pitcall.skip_request_recompute', '', true);

  RETURN _r;
END;
$function$;