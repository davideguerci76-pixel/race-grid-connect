-- 1) Admin-configurable matching settings
INSERT INTO public.platform_settings(key, value_num, category, label, description, unit, sort_order) VALUES
  ('partial_single_max_missing_pct', 30, 'matching', 'Single request: max missing %', 'Maximum share of missing days (vs required span) allowed on a single-race request. Beyond this, partial matches are hidden entirely.', 'percent', 300),
  ('partial_season_max_missing_pct', 20, 'matching', 'Season request: max missing %', 'Maximum share of missing days (vs total season days) allowed on a full-season request. Beyond this, partial matches are hidden entirely.', 'percent', 301),
  ('partial_single_penalty_per_day', 10, 'matching', 'Single request: penalty per missing day (%)', 'Percentage points subtracted from the affinity score for each missing day on a single-race request.', 'percent', 302)
ON CONFLICT (key) DO NOTHING;

-- 2) Match extra columns
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS missing_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missing_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_partial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edge_only boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS skills_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_score numeric NOT NULL DEFAULT 0;

-- 3) Scope on request_tier_unlocks so full/partial pools are unlocked separately
ALTER TABLE public.request_tier_unlocks
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'full';

DO $$
DECLARE _c text;
BEGIN
  FOR _c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.request_tier_unlocks'::regclass
      AND contype = 'u'
      AND conname <> 'request_tier_unlocks_team_id_request_id_tier_scope_key'
  LOOP
    EXECUTE 'ALTER TABLE public.request_tier_unlocks DROP CONSTRAINT ' || quote_ident(_c);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.request_tier_unlocks'::regclass
      AND conname = 'request_tier_unlocks_team_id_request_id_tier_scope_key'
  ) THEN
    ALTER TABLE public.request_tier_unlocks
      ADD CONSTRAINT request_tier_unlocks_team_id_request_id_tier_scope_key
      UNIQUE (team_id, request_id, tier, scope);
  END IF;
END $$;

-- 4) Helper: edge_only detection
CREATE OR REPLACE FUNCTION public.match_edge_only(_freelancer uuid, _required date[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sorted date[];
  _n int;
  _prefix int := 0;
  _suffix int := 0;
  _missing int := 0;
  _has_a boolean;
  _d date;
  _i int;
BEGIN
  IF _required IS NULL OR array_length(_required,1) IS NULL THEN RETURN true; END IF;
  SELECT ARRAY(SELECT unnest(_required) ORDER BY 1) INTO _sorted;
  _n := array_length(_sorted, 1);

  FOR _i IN 1.._n LOOP
    _d := _sorted[_i];
    SELECT EXISTS(SELECT 1 FROM public.availability a WHERE a.freelancer_id = _freelancer AND a.day = _d) INTO _has_a;
    IF _has_a THEN EXIT; END IF;
    _prefix := _prefix + 1;
  END LOOP;

  IF _prefix = _n THEN RETURN true; END IF;

  FOR _i IN REVERSE _n..1 LOOP
    _d := _sorted[_i];
    SELECT EXISTS(SELECT 1 FROM public.availability a WHERE a.freelancer_id = _freelancer AND a.day = _d) INTO _has_a;
    IF _has_a THEN EXIT; END IF;
    _suffix := _suffix + 1;
  END LOOP;

  FOR _i IN 1.._n LOOP
    _d := _sorted[_i];
    SELECT EXISTS(SELECT 1 FROM public.availability a WHERE a.freelancer_id = _freelancer AND a.day = _d) INTO _has_a;
    IF NOT _has_a THEN _missing := _missing + 1; END IF;
  END LOOP;

  RETURN (_prefix + _suffix) >= _missing;
END; $$;

REVOKE EXECUTE ON FUNCTION public.match_edge_only(uuid, date[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_edge_only(uuid, date[]) TO authenticated, service_role;

-- 5) Rewrite recompute_matches to support partial matches with penalties
CREATE OR REPLACE FUNCTION public.recompute_matches(_freelancer_id uuid DEFAULT NULL::uuid, _request_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted_count int := 0;
  _pen_single numeric := COALESCE(public.get_setting_num('partial_single_penalty_per_day', 10), 10);
  _max_single numeric := COALESCE(public.get_setting_num('partial_single_max_missing_pct', 30), 30);
  _max_season numeric := COALESCE(public.get_setting_num('partial_season_max_missing_pct', 20), 20);
BEGIN
  WITH w AS (SELECT * FROM public.matching_weights WHERE id = true),
  scored AS (
    SELECT
      fp.user_id AS freelancer_id, r.team_id, r.id AS request_id,
      CASE
        WHEN r.season_dates IS NOT NULL AND array_length(r.season_dates,1) > 0
          THEN r.season_dates
        ELSE ARRAY(SELECT (r.start_date + n)::date FROM generate_series(0, (r.end_date - r.start_date)) n)
      END AS required_days_arr,
      (r.duration = 'full_season') AS is_season,
      fp.role AS f_role, r.role AS r_role, r.role_hard AS r_role_hard,
      COALESCE(fp.skills,'{}')::text[] AS f_skills,
      COALESCE(r.skills,'{}')::text[] AS r_skills_soft,
      COALESCE(r.skills_hard,'{}')::text[] AS r_skills_hard,
      fp.disciplines, r.discipline,
      fp.day_rate AS f_rate, r.budget_max AS r_budget_max,
      fp.location AS f_loc, r.location AS r_loc,
      fp.education AS f_edu, r.education AS r_edu,
      COALESCE(fp.experiences,'[]'::jsonb) AS f_exps,
      COALESCE(r.experience_requirements,'[]'::jsonb) AS r_exp_reqs,
      COALESCE(fp.languages,'[]'::jsonb) AS f_langs,
      COALESCE(r.languages,'[]'::jsonb) AS r_langs,
      COALESCE(fp.travels,false) AS f_travels,
      COALESCE(r.travel_required,true) AS r_travel_required,
      w.*
    FROM public.requests r
    CROSS JOIN w
    JOIN public.freelancer_profiles fp ON true
    WHERE r.is_active = true
      AND (_freelancer_id IS NULL OR fp.user_id = _freelancer_id)
      AND (_request_id IS NULL OR r.id = _request_id)
  ),
  ovl AS (
    SELECT s.*,
      COALESCE(array_length(s.required_days_arr,1), 0) AS required_days,
      (SELECT COUNT(*)::int FROM unnest(s.required_days_arr) d
         WHERE EXISTS(SELECT 1 FROM public.availability a WHERE a.freelancer_id = s.freelancer_id AND a.day = d)
      ) AS overlap_days
    FROM scored s
  ),
  hard AS (
    SELECT s.*,
      (COALESCE(r_role_hard,true) = false OR f_role = r_role) AS pass_role,
      (r_travel_required = false OR f_travels = true) AS pass_travel,
      (COALESCE(array_length(r_skills_hard,1),0) = 0 OR f_skills @> r_skills_hard) AS pass_skills,
      NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(s.r_exp_reqs) req
        WHERE COALESCE((req->>'hard')::boolean,false)
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(s.f_exps) exp
            WHERE exp->>'discipline' = req->>'discipline'
              AND COALESCE((exp->>'years')::int,0) >= COALESCE((req->>'min_years')::int,0)
          )
      ) AS pass_exp,
      NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(s.r_langs) lreq
        WHERE COALESCE((lreq->>'hard')::boolean,false)
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(s.f_langs) flang
            WHERE lower(coalesce(flang->>'code','')) = lower(coalesce(lreq->>'code',''))
              AND (CASE lower(coalesce(flang->>'level','')) WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3 WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 0 END)
                  >= (CASE lower(coalesce(lreq->>'level','')) WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3 WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 1 END)
          )
      ) AS pass_langs
    FROM ovl s
  ),
  valid AS (
    SELECT * FROM hard
    WHERE pass_role AND pass_travel AND pass_skills AND pass_exp AND pass_langs
      AND required_days > 0
      AND overlap_days > 0
  ),
  parts AS (
    SELECT v.*,
      CASE WHEN f_role = r_role THEN role_weight ELSE 0 END AS role_s,
      CASE
        WHEN COALESCE(array_length(r_skills_soft,1),0) + COALESCE(array_length(r_skills_hard,1),0) = 0 THEN skills_weight
        ELSE skills_weight * (
          COALESCE((
            SELECT COUNT(*)::numeric FROM unnest(r_skills_soft || r_skills_hard) sk
            WHERE sk = ANY(f_skills)
          ),0) / NULLIF(COALESCE(array_length(r_skills_soft,1),0) + COALESCE(array_length(r_skills_hard,1),0),0)
        )
      END AS skills_s,
      CASE WHEN discipline = ANY(disciplines) THEN disciplines_weight ELSE 0 END AS disc_s,
      CASE
        WHEN f_rate IS NULL OR r_budget_max IS NULL THEN day_rate_weight * 0.5
        WHEN f_rate <= r_budget_max THEN day_rate_weight
        WHEN f_rate <= r_budget_max * 1.20 THEN day_rate_weight * 0.5
        ELSE 0
      END AS rate_s,
      CASE
        WHEN jsonb_array_length(r_langs) = 0 THEN languages_weight
        ELSE languages_weight * (
          (SELECT COUNT(*)::numeric FROM jsonb_array_elements(r_langs) lreq
            WHERE EXISTS (
              SELECT 1 FROM jsonb_array_elements(f_langs) flang
              WHERE lower(coalesce(flang->>'code','')) = lower(coalesce(lreq->>'code',''))
                AND (CASE lower(coalesce(flang->>'level','')) WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3 WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 0 END)
                    >= (CASE lower(coalesce(lreq->>'level','')) WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3 WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 1 END)
            )
          ) / NULLIF(jsonb_array_length(r_langs),0)::numeric
        )
      END AS langs_s,
      CASE
        WHEN COALESCE(array_length(r_edu,1),0) = 0 THEN education_weight
        WHEN f_edu = ANY(r_edu) THEN education_weight
        ELSE 0
      END AS edu_s,
      CASE
        WHEN COALESCE(r_loc,'') = '' THEN location_weight
        WHEN lower(coalesce(f_loc,'')) = lower(coalesce(r_loc,'')) THEN location_weight
        WHEN lower(coalesce(f_loc,'')) LIKE '%'||lower(coalesce(r_loc,''))||'%'
          OR lower(coalesce(r_loc,'')) LIKE '%'||lower(coalesce(f_loc,''))||'%' THEN location_weight * 0.5
        ELSE 0
      END AS loc_s
    FROM valid v
  ),
  computed AS (
    SELECT p.*,
      LEAST(100, ROUND(role_s + skills_s + disc_s + rate_s + langs_s + edu_s + loc_s, 2)) AS skills_score_v,
      (required_days - overlap_days) AS missing_days_v,
      ROUND(((required_days - overlap_days)::numeric / NULLIF(required_days,0)) * 100, 2) AS missing_pct_v
    FROM parts p
  ),
  filtered AS (
    SELECT c.*
    FROM computed c
    WHERE
      CASE WHEN c.missing_days_v = 0 THEN TRUE
           WHEN c.is_season THEN c.missing_pct_v <= _max_season
           ELSE c.missing_pct_v <= _max_single
      END
  ),
  final AS (
    SELECT freelancer_id, team_id, request_id, overlap_days,
      skills_score_v AS skills_score,
      missing_days_v AS missing_days,
      missing_pct_v AS missing_pct,
      (missing_days_v > 0) AS is_partial,
      CASE WHEN missing_days_v = 0 THEN true ELSE public.match_edge_only(freelancer_id, required_days_arr) END AS edge_only,
      GREATEST(0, ROUND(
        skills_score_v - CASE
          WHEN missing_days_v = 0 THEN 0
          WHEN is_season THEN missing_pct_v
          ELSE _pen_single * missing_days_v
        END, 2)) AS final_score,
      (
        (CASE WHEN role_s < role_weight THEN jsonb_build_array(jsonb_build_object('kind','role','label',r_role)) ELSE '[]'::jsonb END)
        || COALESCE((
          SELECT jsonb_agg(jsonb_build_object('kind','skill','label',sk,'hard', sk = ANY(r_skills_hard)))
          FROM unnest(r_skills_soft || r_skills_hard) sk
          WHERE NOT (sk = ANY(f_skills))
        ),'[]'::jsonb)
        || COALESCE((
          SELECT jsonb_agg(jsonb_build_object('kind','language','code',lreq->>'code','level',lreq->>'level','hard',COALESCE((lreq->>'hard')::boolean,false)))
          FROM jsonb_array_elements(r_langs) lreq
          WHERE NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(f_langs) flang
            WHERE lower(coalesce(flang->>'code','')) = lower(coalesce(lreq->>'code',''))
              AND (CASE lower(coalesce(flang->>'level','')) WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3 WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 0 END)
                  >= (CASE lower(coalesce(lreq->>'level','')) WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3 WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 1 END)
          )
        ),'[]'::jsonb)
        || (CASE WHEN missing_days_v > 0 THEN jsonb_build_array(jsonb_build_object('kind','missing_days','days',missing_days_v)) ELSE '[]'::jsonb END)
        || (CASE WHEN edu_s = 0 AND COALESCE(array_length(r_edu,1),0) > 0 THEN jsonb_build_array(jsonb_build_object('kind','education')) ELSE '[]'::jsonb END)
        || (CASE WHEN rate_s < day_rate_weight THEN jsonb_build_array(jsonb_build_object('kind','day_rate')) ELSE '[]'::jsonb END)
        || (CASE WHEN loc_s < location_weight THEN jsonb_build_array(jsonb_build_object('kind','location','label',r_loc)) ELSE '[]'::jsonb END)
      ) AS missing_criteria
    FROM filtered
  ),
  deleted AS (
    DELETE FROM public.matches m
    WHERE (_freelancer_id IS NULL OR m.freelancer_id = _freelancer_id)
      AND (_request_id IS NULL OR m.request_id = _request_id)
      AND NOT EXISTS (SELECT 1 FROM final f WHERE f.freelancer_id = m.freelancer_id AND f.request_id = m.request_id)
    RETURNING 1
  )
  INSERT INTO public.matches (freelancer_id, team_id, request_id, overlap_days, score, match_score, missing_criteria, is_perfect,
                              missing_days, missing_pct, is_partial, edge_only, skills_score, final_score)
  SELECT freelancer_id, team_id, request_id, overlap_days, overlap_days::numeric, skills_score, missing_criteria,
         (skills_score >= 100 AND missing_days = 0),
         missing_days, missing_pct, is_partial, edge_only, skills_score, final_score
  FROM final
  ON CONFLICT (freelancer_id, request_id) DO UPDATE
    SET overlap_days = EXCLUDED.overlap_days,
        score = EXCLUDED.score,
        match_score = EXCLUDED.match_score,
        missing_criteria = EXCLUDED.missing_criteria,
        is_perfect = EXCLUDED.is_perfect,
        missing_days = EXCLUDED.missing_days,
        missing_pct = EXCLUDED.missing_pct,
        is_partial = EXCLUDED.is_partial,
        edge_only = EXCLUDED.edge_only,
        skills_score = EXCLUDED.skills_score,
        final_score = EXCLUDED.final_score;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END; $function$;

-- 6) unlock_request_tier: add _scope
DROP FUNCTION IF EXISTS public.unlock_request_tier(uuid, integer);

CREATE OR REPLACE FUNCTION public.unlock_request_tier(_request_id uuid, _tier integer, _scope text DEFAULT 'full')
RETURNS TABLE(tier integer, tokens_spent integer, balance integer, total_matches integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _team uuid;
  _total int;
  _tier2_size int;
  _tier3_size int;
  _cap int;
  _tier_base numeric;
  _slots int;
  _size int;
  _cost int;
  _bal int;
  _existing public.request_tier_unlocks%ROWTYPE;
  _is_partial boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _tier NOT IN (2,3) THEN RAISE EXCEPTION 'Invalid tier'; END IF;
  IF _scope NOT IN ('full','partial') THEN RAISE EXCEPTION 'Invalid scope'; END IF;
  _is_partial := (_scope = 'partial');

  SELECT team_id INTO _team FROM public.requests WHERE id = _request_id;
  IF _team IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _team <> _uid THEN RAISE EXCEPTION 'Not owner of this request'; END IF;

  SELECT * INTO _existing FROM public.request_tier_unlocks
    WHERE team_id = _uid AND request_id = _request_id
      AND request_tier_unlocks.tier = _tier AND request_tier_unlocks.scope = _scope;
  IF FOUND THEN
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    SELECT COUNT(*)::int INTO _total FROM public.matches
      WHERE request_id = _request_id AND is_partial = _is_partial;
    RETURN QUERY SELECT _tier, _existing.tokens_spent, _bal, LEAST(_total, COALESCE((SELECT get_setting_num('hard_cap_matches',50))::int,50));
    RETURN;
  END IF;

  _cap := COALESCE(public.get_setting_num('hard_cap_matches', 50)::int, 50);
  _tier2_size := COALESCE(public.get_setting_num('tier2_size', 10)::int, 10);
  _tier3_size := COALESCE(public.get_setting_num('tier3_size', 30)::int, 30);

  SELECT COUNT(*)::int INTO _total FROM public.matches
    WHERE request_id = _request_id AND is_partial = _is_partial;
  _total := LEAST(_total, _cap);

  IF _tier = 2 THEN
    _size := _tier2_size;
    _slots := GREATEST(0, LEAST(_total, 10 + _tier2_size) - 10);
    _tier_base := public.get_setting_num('cost_tier2_entry', 5);
  ELSE
    _size := _tier3_size;
    _slots := GREATEST(0, LEAST(_total, 10 + _tier2_size + _tier3_size) - (10 + _tier2_size));
    _tier_base := public.get_setting_num('cost_tier3_entry', 25);
  END IF;

  IF _slots <= 0 THEN RAISE EXCEPTION 'No matches available in this tier'; END IF;

  IF _slots >= _size THEN
    _cost := ROUND(_tier_base)::int;
  ELSE
    _cost := GREATEST(1, ROUND(_tier_base * _slots::numeric / _size::numeric)::int);
  END IF;

  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < _cost THEN
    RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal, 0);
  END IF;

  _bal := public.credit_tokens(_uid, -_cost, 'team_reveal_spend'::public.token_reason, _request_id,
    'Unlock tier ' || _tier || ' (' || _scope || ') for request');

  INSERT INTO public.request_tier_unlocks(team_id, request_id, tier, scope, tokens_spent)
    VALUES (_uid, _request_id, _tier, _scope, _cost);

  RETURN QUERY SELECT _tier, _cost, _bal, _total;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.unlock_request_tier(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_request_tier(uuid, integer, text) TO authenticated;

-- 7) Rewrite unlock_match_for_team to rank within scope by final_score
CREATE OR REPLACE FUNCTION public.unlock_match_for_team(_match_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _m public.matches%ROWTYPE;
  _rank int;
  _bal int;
  _already boolean;
  _cost int;
  _cap int;
  _tier2_size int;
  _tier_needed int;
  _tier_ok boolean;
  _scope text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _m.team_id <> _uid THEN RAISE EXCEPTION 'Not owner'; END IF;

  _scope := CASE WHEN _m.is_partial THEN 'partial' ELSE 'full' END;

  SELECT EXISTS(SELECT 1 FROM public.match_unlocks WHERE team_id = _uid AND match_id = _match_id) INTO _already;
  IF _already THEN
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;

  SELECT COUNT(*) + 1 INTO _rank FROM public.matches
    WHERE request_id = _m.request_id
      AND is_partial = _m.is_partial
      AND (final_score > _m.final_score OR (final_score = _m.final_score AND created_at < _m.created_at));

  _cap := COALESCE(public.get_setting_num('hard_cap_matches', 50)::int, 50);
  IF _rank > _cap THEN RAISE EXCEPTION 'Match beyond the hard cap'; END IF;

  _tier2_size := COALESCE(public.get_setting_num('tier2_size', 10)::int, 10);

  IF _rank <= 3 THEN
    INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
      VALUES (_uid, _match_id, _m.request_id, _m.freelancer_id, true)
      ON CONFLICT DO NOTHING;
    UPDATE public.matches SET revealed_by_team = true WHERE id = _match_id;
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;

  IF _rank > 10 THEN
    IF _rank <= 10 + _tier2_size THEN _tier_needed := 2; ELSE _tier_needed := 3; END IF;
    SELECT EXISTS(
      SELECT 1 FROM public.request_tier_unlocks
      WHERE team_id = _uid AND request_id = _m.request_id
        AND tier = _tier_needed AND scope = _scope
    ) INTO _tier_ok;
    IF NOT _tier_ok THEN
      RAISE EXCEPTION 'Tier % (%) not unlocked for this request', _tier_needed, _scope;
    END IF;
  END IF;

  _cost := public.get_setting_num('cost_unlock_match_for_team', 1)::int;
  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal < _cost THEN RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal,0); END IF;

  INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
    VALUES (_uid, _match_id, _m.request_id, _m.freelancer_id, false);
  UPDATE public.matches SET revealed_by_team = true WHERE id = _match_id;
  _bal := public.credit_tokens(_uid, -_cost, 'team_reveal_spend'::public.token_reason, _match_id, 'Unlock candidate');
  RETURN _bal;
END; $function$;

-- 8) Backfill: recompute all matches with the new engine
SELECT public.recompute_matches(NULL, NULL);