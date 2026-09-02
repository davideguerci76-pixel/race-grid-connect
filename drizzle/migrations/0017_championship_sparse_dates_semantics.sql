-- STEP 2B: server-side dedupe of season_dates + SOS conflict check on covered_days.
-- Matching core (recompute_matches, thresholds, overlap gate) is untouched.

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
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

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

  -- Championship season dates are normalized server-side: DISTINCT + chronological.
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

  INSERT INTO public.requests(
    team_id, title, discipline, duration,
    circuit, location, start_date, end_date,
    budget_min, budget_max, budget_unit, notes, season_dates, skills, skills_hard, education,
    experience_requirements, languages, role_hard, travel_required,
    location_lat, location_lng, location_relevance, location_anchor, location_radius_km,
    role_group, sub_role, sub_role_min_level, sub_role_hard, search_mode
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
    _role_group, _sub_role, _sub_level, _sub_hard, _search_mode
  ) RETURNING * INTO _new;

  UPDATE public.profiles SET token_balance = token_balance - _cost WHERE id = _uid;
  INSERT INTO public.token_transactions(user_id, delta, reason, ref_id)
    VALUES (_uid, -_cost, 'request_post', _new.id);

  IF _search_mode = 'pool' THEN
    INSERT INTO public.pool_search_unlocks(team_id, request_id, tokens_spent)
      VALUES (_uid, _new.id, _cost)
      ON CONFLICT (team_id, request_id) DO NOTHING;
  END IF;

  RETURN _new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_sos_call(_request_id uuid)
 RETURNS sos_calls
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r public.requests%ROWTYPE;
  _now timestamptz := now();
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
    RAISE EXCEPTION 'SOS Call is only available on the first required day (%). Today is %.', _first_day, _now::date;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.engagements WHERE request_id = _request_id AND status = 'confirmed') INTO _has_confirmed;
  IF _has_confirmed THEN RAISE EXCEPTION 'This request already has a confirmed match'; END IF;

  _min_pct := public.get_setting_num('sos_min_match_pct', 75);

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
      -- Sparse-aware: an engagement occupies ONLY its covered_days snapshot when present.
      AND NOT EXISTS (
        SELECT 1 FROM public.engagements e
        WHERE e.freelancer_id = m.freelancer_id
          AND e.status IN ('confirmed','proposed')
          AND (
            CASE
              WHEN e.covered_days IS NOT NULL AND array_length(e.covered_days, 1) > 0
                THEN _first_day = ANY(e.covered_days)
              ELSE _first_day BETWEEN e.start_date AND e.end_date
            END
          )
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
