ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS repost_identical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS repost_source_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS requests_team_idempotency_key_uidx
  ON public.requests(team_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

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

  -- Compute once while the row is active, then freeze the initial band and enter
  -- the server-authoritative post-review window before returning to the client.
  _match_count := public.recompute_matches(NULL, _new.id);
  _potential := public.classify_match_potential(_match_count);
  _post_review_minutes := GREATEST(0, COALESCE(public.get_setting_num('post_review_window_minutes', 5), 5)::int);
  UPDATE public.requests
     SET status = 'pending_review',
         is_active = false,
         initial_match_potential = _potential,
         match_potential_current = _potential,
         review_deadline_at = now() + (_post_review_minutes || ' minutes')::interval,
         activated_at = NULL,
         updated_at = now()
   WHERE id = _new.id
   RETURNING * INTO _new;

  RETURN _new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_refund_quote(_request_id uuid)
 RETURNS TABLE(spent integer, refund_pct numeric, zero_match_refund_full integer, refund_full integer, refund_partial integer, low_relevance_eligible boolean, low_relevance_refund integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r public.requests%ROWTYPE;
  _hard_count integer := 0;
  _min_pct numeric;
  _drop numeric;
  _pct numeric;
  _spent integer := 0;
  _zero_full integer := 0;
  _low_eligible boolean := false;
  _low_refund integer := 0;
  _lang jsonb;
  _exp jsonb;
  _threshold numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _r
  FROM public.requests
  WHERE id = _request_id
    AND team_id = _uid
    AND is_test = public.env_is_test();
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  SELECT COALESCE(SUM(-delta), 0)::int INTO _spent
  FROM public.token_transactions
  WHERE user_id = _uid AND ref_id = _request_id AND reason = 'request_post';

  IF COALESCE(_r.role_hard, false) THEN _hard_count := _hard_count + 1; END IF;
  IF COALESCE(_r.travel_required, false) THEN _hard_count := _hard_count + 1; END IF;
  _hard_count := _hard_count + COALESCE(array_length(_r.skills_hard, 1), 0);
  IF COALESCE(array_length(_r.education, 1), 0) > 0 THEN _hard_count := _hard_count + 1; END IF;
  IF COALESCE(_r.location_relevance, 'not_relevant') = 'mandatory' THEN _hard_count := _hard_count + 1; END IF;
  FOR _lang IN SELECT * FROM jsonb_array_elements(COALESCE(_r.languages, '[]'::jsonb)) LOOP
    IF COALESCE((_lang->>'hard')::boolean, false) THEN _hard_count := _hard_count + 1; END IF;
  END LOOP;
  FOR _exp IN SELECT * FROM jsonb_array_elements(COALESCE(_r.experience_requirements, '[]'::jsonb)) LOOP
    IF COALESCE((_exp->>'hard')::boolean, false) THEN _hard_count := _hard_count + 1; END IF;
  END LOOP;

  _min_pct := COALESCE(public.get_setting_num('refund_min_pct', 20), 20);
  _drop := COALESCE(public.get_setting_num('refund_hard_penalty_pct', 10), 10);
  _pct := GREATEST(_min_pct, 100 - _hard_count * _drop);
  _pct := GREATEST(0, LEAST(100, _pct));

  _zero_full := ROUND(_spent * _pct / 100.0)::int;
  IF _spent > 0 AND _zero_full < 1 AND _pct > 0 THEN _zero_full := 1; END IF;

  _threshold := COALESCE(public.get_setting_num('professional_relevance_threshold', 50), 50);
  _low_eligible :=
    NOT COALESCE(_r.was_pool_request, false)
    AND COALESCE(_r.search_mode, 'standard') <> 'pool'
    AND NOT COALESCE(_r.ever_relevant_match, false)
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.request_id = _request_id
        AND m.skills_score IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.request_id = _request_id
        AND m.skills_score IS NOT NULL
        AND m.skills_score >= _threshold
    );

  _low_refund := CASE
    WHEN _zero_full > 0 THEN GREATEST(1, ROUND(_zero_full * 0.70)::int)
    ELSE 0
  END;

  -- PRODUCT LAW: a Pit Call published through Post Identical is already
  -- discounted and is final. It is never eligible for any automatic refund.
  IF COALESCE(_r.repost_identical, false) THEN
    _pct := 0;
    _zero_full := 0;
    _low_eligible := false;
    _low_refund := 0;
  END IF;

  RETURN QUERY SELECT
    _spent,
    _pct,
    _zero_full,
    CASE WHEN _low_eligible THEN _low_refund ELSE _zero_full END,
    GREATEST(CASE WHEN _zero_full > 0 THEN 1 ELSE 0 END, ROUND(_zero_full / 2.0)::int),
    _low_eligible,
    _low_refund;
END;
$function$;

CREATE OR REPLACE FUNCTION public.red_cancel_request(_request_id uuid)
 RETURNS TABLE(refund_tokens integer, balance integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r public.requests%ROWTYPE;
  _spent integer := 0;
  _new_bal integer;
  _budget_cost integer;
  _credit integer := 0;
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

  -- Post Identical Pit Calls are never refundable, RED cancel included.
  _credit := CASE WHEN COALESCE(_r.repost_identical, false) THEN 0 ELSE _spent END;

  IF _credit > 0 THEN
    _new_bal := public.credit_tokens(_uid, _credit, 'refund'::public.token_reason, _request_id,
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
         red_cancel_tokens = _credit,
         refund_kind = 'red_cancel',
         refund_tokens = _credit,
         refund_pct = CASE WHEN _credit > 0 THEN 100 ELSE 0 END,
         partial_refund_taken = true,
         review_deadline_at = NULL,
         updated_at = now()
   WHERE id = _request_id;

  RETURN QUERY SELECT _credit, _new_bal;
END;
$function$;