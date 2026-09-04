-- 0065 STEP 11.4D: fair deterministic ranking + per-scope free previews

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS criteria_contributions jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.match_rank_vector(_contrib jsonb)
RETURNS numeric[]
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(
    array_agg(ROUND(COALESCE((_contrib->>k.key)::numeric, 0), 4) ORDER BY k.weight DESC, k.key ASC),
    ARRAY[]::numeric[])
  FROM (
    SELECT 'sub_role'::text AS key, w.sub_role_weight AS weight FROM public.matching_weights w WHERE w.id
    UNION ALL SELECT 'skills', w.skills_weight FROM public.matching_weights w WHERE w.id
    UNION ALL SELECT 'disciplines', w.disciplines_weight FROM public.matching_weights w WHERE w.id
    UNION ALL SELECT 'day_rate', w.day_rate_weight FROM public.matching_weights w WHERE w.id
    UNION ALL SELECT 'languages', w.languages_weight FROM public.matching_weights w WHERE w.id
    UNION ALL SELECT 'location', w.location_weight FROM public.matching_weights w WHERE w.id
    UNION ALL SELECT 'education', w.education_weight FROM public.matching_weights w WHERE w.id
  ) k;
$fn$;

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
  _now timestamptz := now();
  _today date := now()::date;
  _cutoff timestamptz := now() - (COALESCE(public.get_setting_num('availability_max_age_days', 90), 90) || ' days')::interval;
BEGIN
  UPDATE public.matches m SET stale = true
    WHERE (_freelancer_id IS NULL OR m.freelancer_id = _freelancer_id)
      AND (_request_id IS NULL OR m.request_id = _request_id)
      AND m.stale = false
      AND NOT EXISTS (
        SELECT 1 FROM public.engagements e
        WHERE e.request_id = m.request_id
          AND e.freelancer_id = m.freelancer_id
          AND e.status IN ('confirmed', 'completed')
      );

  WITH w AS (SELECT * FROM public.matching_weights WHERE id = true),
  scored AS (
    SELECT
      fp.user_id AS freelancer_id, r.team_id, r.id AS request_id,
      COALESCE(r.search_mode, 'standard') AS search_mode,
      EXISTS (
        SELECT 1 FROM public.team_pool pool
        WHERE pool.team_id = r.team_id AND pool.freelancer_id = fp.user_id
      ) AS is_pool_member,
      public.request_required_days_internal(r.id) AS required_days_arr,
      (r.duration = 'full_season') AS is_season,
      fp.role_group AS f_group, r.role_group AS r_group,
      COALESCE(fp.sub_roles,'[]'::jsonb) AS f_sub_roles,
      r.sub_role AS r_sub_role,
      COALESCE(r.sub_role_min_level,'junior') AS r_sub_level,
      COALESCE(r.sub_role_hard,false) AS r_sub_hard,
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
      fp.location_lat AS f_lat, fp.location_lng AS f_lng,
      r.location_lat AS r_lat, r.location_lng AS r_lng,
      COALESCE(r.location_relevance,'not_relevant') AS r_loc_rel,
      COALESCE(r.location_anchor,'this') AS r_loc_anchor,
      r.location_radius_km AS r_loc_radius,
      tp.location_lat AS t_lat, tp.location_lng AS t_lng,
      fp.calendar_last_confirmed_at AS f_cal_confirmed,
      w.*
    FROM public.requests r
    CROSS JOIN w
    JOIN public.freelancer_profiles fp ON true
    LEFT JOIN public.team_profiles tp ON tp.user_id = r.team_id
    WHERE r.is_active = true
      AND (_freelancer_id IS NULL OR fp.user_id = _freelancer_id)
      AND (_request_id IS NULL OR r.id = _request_id)
  ),
  geo AS (
    SELECT s.*, CASE WHEN s.r_loc_anchor = 'team' THEN s.t_lat ELSE s.r_lat END AS anchor_lat,
      CASE WHEN s.r_loc_anchor = 'team' THEN s.t_lng ELSE s.r_lng END AS anchor_lng
    FROM scored s
  ),
  dist AS (
    SELECT g.*, public.haversine_km(g.f_lat, g.f_lng, g.anchor_lat, g.anchor_lng) AS distance_km
    FROM geo g
  ),
  ovl AS (
    SELECT s.*, COALESCE(array_length(s.required_days_arr,1), 0) AS required_days,
      (SELECT COUNT(*)::int FROM unnest(s.required_days_arr) d
       WHERE EXISTS (SELECT 1 FROM public.availability a
         WHERE a.freelancer_id = s.freelancer_id AND a.day = d AND a.day >= _today
           AND GREATEST(COALESCE(s.f_cal_confirmed, '-infinity'::timestamptz), a.created_at) > _cutoff)
         AND NOT public.day_blocked_by_engagement(s.freelancer_id, d)) AS overlap_days,
      (SELECT MAX(CASE lower(coalesce(sr->>'level','')) WHEN 'junior' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'senior' THEN 3 ELSE 1 END)
       FROM jsonb_array_elements(s.f_sub_roles) sr WHERE sr->>'sub_role' = s.r_sub_role) AS f_sub_rank,
      (CASE lower(coalesce(s.r_sub_level,'junior')) WHEN 'junior' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'senior' THEN 3 ELSE 1 END) AS r_sub_rank
    FROM dist s
  ),
  hard AS (
    SELECT s.*, (s.r_group IS NULL OR s.f_group = s.r_group) AS pass_group,
      (s.r_sub_hard = false OR s.r_sub_role IS NULL OR s.f_sub_rank IS NOT NULL) AS pass_sub_role,
      (r_travel_required = false OR f_travels = true) AS pass_travel,
      (COALESCE(array_length(r_skills_hard,1),0) = 0 OR f_skills @> r_skills_hard) AS pass_skills,
      NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.r_exp_reqs) req
        WHERE COALESCE((req->>'hard')::boolean,false) AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.f_exps) exp
          WHERE exp->>'discipline' = req->>'discipline' AND COALESCE((exp->>'years')::int,0) >= COALESCE((req->>'min_years')::int,0))) AS pass_exp,
      NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.r_langs) lreq
        WHERE COALESCE((lreq->>'hard')::boolean,false) AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.f_langs) flang
          WHERE lower(coalesce(flang->>'code','')) = lower(coalesce(lreq->>'code',''))
            AND (CASE lower(coalesce(flang->>'level','')) WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3 WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 0 END)
              >= (CASE lower(coalesce(lreq->>'level','')) WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3 WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 1 END))) AS pass_langs,
      (s.r_loc_rel <> 'mandatory' OR s.anchor_lat IS NULL OR s.anchor_lng IS NULL OR s.f_lat IS NULL OR s.f_lng IS NULL
       OR s.r_loc_radius IS NULL OR (s.distance_km IS NOT NULL AND s.distance_km <= s.r_loc_radius)) AS pass_geo
    FROM ovl s
  ),
  valid AS (
    SELECT * FROM hard WHERE pass_group AND pass_sub_role AND pass_travel AND pass_skills AND pass_exp AND pass_langs AND pass_geo
      AND required_days > 0 AND overlap_days > 0
  ),
  parts AS (
    SELECT v.*, CASE
        WHEN r_sub_role IS NULL THEN sub_role_weight
        WHEN f_sub_rank IS NULL THEN 0
        WHEN f_sub_rank >= r_sub_rank THEN sub_role_weight * (level_exact_pct / 100.0)
        WHEN r_sub_rank - f_sub_rank = 1 THEN sub_role_weight * (level_one_below_pct / 100.0)
        ELSE sub_role_weight * (level_two_below_pct / 100.0)
      END AS subrole_s,
      CASE WHEN COALESCE(array_length(r_skills_soft,1),0) + COALESCE(array_length(r_skills_hard,1),0) = 0 THEN skills_weight
        ELSE skills_weight * (COALESCE((SELECT COUNT(*)::numeric FROM unnest(r_skills_soft || r_skills_hard) sk WHERE sk = ANY(f_skills)),0)
          / NULLIF(COALESCE(array_length(r_skills_soft,1),0) + COALESCE(array_length(r_skills_hard,1),0),0)) END AS skills_s,
      CASE WHEN discipline = ANY(disciplines) THEN disciplines_weight ELSE 0 END AS disc_s,
      CASE WHEN f_rate IS NULL OR r_budget_max IS NULL THEN day_rate_weight * 0.5
        WHEN f_rate <= r_budget_max THEN day_rate_weight
        WHEN f_rate <= r_budget_max * 1.20 THEN day_rate_weight * 0.5 ELSE 0 END AS rate_s,
      CASE WHEN jsonb_array_length(r_langs) = 0 THEN languages_weight ELSE languages_weight * ((SELECT COUNT(*)::numeric FROM jsonb_array_elements(r_langs) lreq
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(f_langs) flang WHERE lower(coalesce(flang->>'code','')) = lower(coalesce(lreq->>'code',''))
          AND (CASE lower(coalesce(flang->>'level','')) WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3 WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 0 END)
            >= (CASE lower(coalesce(lreq->>'level','')) WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3 WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 1 END))) / NULLIF(jsonb_array_length(r_langs),0)::numeric) END AS langs_s,
      CASE WHEN COALESCE(array_length(r_edu,1),0) = 0 THEN education_weight WHEN f_edu = ANY(r_edu) THEN education_weight ELSE 0 END AS edu_s,
      CASE WHEN r_loc_rel = 'not_relevant' THEN location_weight
        WHEN anchor_lat IS NULL OR anchor_lng IS NULL OR f_lat IS NULL OR f_lng IS NULL OR r_loc_radius IS NULL THEN location_weight * 0.5
        WHEN distance_km IS NULL THEN location_weight * 0.5 WHEN distance_km <= r_loc_radius THEN location_weight
        WHEN distance_km <= r_loc_radius * 1.2 THEN location_weight * 0.5 ELSE 0 END AS loc_s
    FROM valid v
  ),
  computed AS (
    SELECT p.*, LEAST(100, ROUND(subrole_s + skills_s + disc_s + rate_s + langs_s + edu_s + loc_s, 2)) AS skills_score_v,
      (required_days - overlap_days) AS missing_days_v,
      ROUND(((required_days - overlap_days)::numeric / NULLIF(required_days,0)) * 100, 2) AS missing_pct_v
    FROM parts p
  ),
  filtered AS (
    SELECT c.* FROM computed c WHERE CASE WHEN c.missing_days_v = 0 THEN TRUE
      WHEN c.search_mode = 'pool' AND c.is_pool_member THEN TRUE
      WHEN c.is_season THEN c.missing_pct_v <= _max_season ELSE c.missing_pct_v <= _max_single END
  ),
  final AS (
    SELECT freelancer_id, team_id, request_id, overlap_days, skills_score_v AS skills_score,
      missing_days_v AS missing_days, missing_pct_v AS missing_pct, (missing_days_v > 0) AS is_partial,
      CASE WHEN missing_days_v = 0 THEN true ELSE public.match_edge_only(freelancer_id, required_days_arr) END AS edge_only,
      GREATEST(0, ROUND(skills_score_v - CASE WHEN missing_days_v = 0 THEN 0 WHEN is_season THEN missing_pct_v ELSE _pen_single * missing_days_v END, 2)) AS final_score,
      ((CASE WHEN r_sub_role IS NOT NULL AND subrole_s < sub_role_weight THEN jsonb_build_array(jsonb_build_object('kind','sub_role','label',r_sub_role,'level',r_sub_level,'hard',r_sub_hard)) ELSE '[]'::jsonb END)
       || COALESCE((SELECT jsonb_agg(jsonb_build_object('kind','skill','label',sk,'hard', sk = ANY(r_skills_hard))) FROM unnest(r_skills_soft || r_skills_hard) sk WHERE NOT (sk = ANY(f_skills))),'[]'::jsonb)
       || COALESCE((SELECT jsonb_agg(jsonb_build_object('kind','language','code',lreq->>'code','level',lreq->>'level','hard',COALESCE((lreq->>'hard')::boolean,false))) FROM jsonb_array_elements(r_langs) lreq WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(f_langs) flang WHERE lower(coalesce(flang->>'code','')) = lower(coalesce(lreq->>'code','')) AND (CASE lower(coalesce(flang->>'level','')) WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3 WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 1 END) >= (CASE lower(coalesce(flang->>'level','')) WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3 WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 1 END))),'[]'::jsonb)
       || CASE WHEN missing_days_v > 0 THEN jsonb_build_array(jsonb_build_object('kind','missing_days','days',missing_days_v)) ELSE '[]'::jsonb END
       || CASE WHEN edu_s = 0 AND COALESCE(array_length(r_edu,1),0) > 0 THEN jsonb_build_array(jsonb_build_object('kind','education')) ELSE '[]'::jsonb END
       || CASE WHEN rate_s < day_rate_weight THEN jsonb_build_array(jsonb_build_object('kind','day_rate')) ELSE '[]'::jsonb END
       || CASE WHEN loc_s < location_weight THEN jsonb_build_array(jsonb_build_object('kind','location','label',r_loc,'distance_km',ROUND(distance_km,1))) ELSE '[]'::jsonb END) AS missing_criteria,
      jsonb_build_object(
        'sub_role', ROUND(subrole_s,4), 'skills', ROUND(skills_s,4), 'disciplines', ROUND(disc_s,4),
        'day_rate', ROUND(rate_s,4), 'languages', ROUND(langs_s,4), 'location', ROUND(loc_s,4),
        'education', ROUND(edu_s,4)
      ) AS criteria_contributions
    FROM filtered
  ),
  deleted AS (
    DELETE FROM public.matches m WHERE (_freelancer_id IS NULL OR m.freelancer_id = _freelancer_id)
      AND (_request_id IS NULL OR m.request_id = _request_id)
      AND NOT EXISTS (SELECT 1 FROM final f WHERE f.freelancer_id = m.freelancer_id AND f.request_id = m.request_id)
      AND NOT EXISTS (SELECT 1 FROM public.engagements e WHERE e.match_id = m.id AND e.status IN ('proposed','confirmed','completed')) RETURNING 1
  )
  INSERT INTO public.matches (freelancer_id, team_id, request_id, overlap_days, score, match_score, missing_criteria, is_perfect, missing_days, missing_pct, is_partial, edge_only, skills_score, final_score, criteria_contributions)
  SELECT freelancer_id, team_id, request_id, overlap_days, overlap_days::numeric, skills_score, missing_criteria, (skills_score >= 100 AND missing_days = 0), missing_days, missing_pct, is_partial, edge_only, skills_score, final_score, criteria_contributions
  FROM final
  ON CONFLICT (freelancer_id, request_id) DO UPDATE SET stale = false, overlap_days = EXCLUDED.overlap_days, score = EXCLUDED.score, match_score = EXCLUDED.match_score, missing_criteria = EXCLUDED.missing_criteria, is_perfect = EXCLUDED.is_perfect, missing_days = EXCLUDED.missing_days, missing_pct = EXCLUDED.missing_pct, is_partial = EXCLUDED.is_partial, edge_only = EXCLUDED.edge_only, skills_score = EXCLUDED.skills_score, final_score = EXCLUDED.final_score, criteria_contributions = EXCLUDED.criteria_contributions;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$function$

;

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
  _in_pool boolean;
  _free_n int;
  _ext_rank int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _m.team_id <> _uid THEN RAISE EXCEPTION 'Not owner'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'match_unlock:' || _uid::text || ':' || _m.request_id::text || ':' || _m.freelancer_id::text, 0));

  _scope := CASE WHEN _m.is_partial THEN 'partial' ELSE 'full' END;

  SELECT EXISTS(
    SELECT 1 FROM public.match_unlocks
    WHERE team_id = _uid AND request_id = _m.request_id AND freelancer_id = _m.freelancer_id
  ) INTO _already;
  IF _already THEN
    UPDATE public.match_unlocks
       SET match_id = _match_id
     WHERE team_id = _uid AND request_id = _m.request_id AND freelancer_id = _m.freelancer_id
       AND match_id IS DISTINCT FROM _match_id;
    UPDATE public.matches SET revealed_by_team = true WHERE id = _match_id;
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.team_pool tp
    WHERE tp.team_id = _uid AND tp.freelancer_id = _m.freelancer_id
      AND tp.is_test = public.env_is_test()
  ) INTO _in_pool;

  -- Pool members are always free and never consume a free preview slot
  IF _in_pool THEN
    INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
      VALUES (_uid, _match_id, _m.request_id, _m.freelancer_id, true)
      ON CONFLICT (team_id, request_id, freelancer_id) DO NOTHING;
    UPDATE public.matches SET revealed_by_team = true WHERE id = _match_id;
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;

  -- Deterministic, unique position inside the scope list (full or partial):
  -- total relevance DESC, then per-criterion contributions ordered by current ACP weights,
  -- finally freelancer_id ASC as a stable technical tie-break.
  SELECT q.rn INTO _rank FROM (
    SELECT m2.id,
      row_number() OVER (ORDER BY m2.final_score DESC,
        public.match_rank_vector(m2.criteria_contributions) DESC,
        m2.freelancer_id ASC) AS rn
    FROM public.matches m2
    WHERE m2.request_id = _m.request_id AND m2.is_partial = _m.is_partial AND m2.stale = false
  ) q WHERE q.id = _match_id;

  _cap := COALESCE(public.get_setting_num('hard_cap_matches', 50)::int, 50);
  IF _rank IS NULL OR _rank > _cap THEN RAISE EXCEPTION 'Match beyond the hard cap'; END IF;

  _tier2_size := COALESCE(public.get_setting_num('tier2_size', 10)::int, 10);
  _free_n := GREATEST(0, COALESCE(public.get_setting_num('free_preview_count', 3)::int, 3));

  -- Free quota is per match type: the first N external FULL and the first N external PARTIAL.
  SELECT q.rn INTO _ext_rank FROM (
    SELECT m2.id,
      row_number() OVER (ORDER BY m2.final_score DESC,
        public.match_rank_vector(m2.criteria_contributions) DESC,
        m2.freelancer_id ASC) AS rn
    FROM public.matches m2
    WHERE m2.request_id = _m.request_id AND m2.is_partial = _m.is_partial AND m2.stale = false
      AND NOT EXISTS (
        SELECT 1 FROM public.team_pool tp
        WHERE tp.team_id = _uid AND tp.freelancer_id = m2.freelancer_id
          AND tp.is_test = public.env_is_test()
      )
  ) q WHERE q.id = _match_id;

  IF _ext_rank IS NOT NULL AND _ext_rank <= _free_n THEN
    INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
      VALUES (_uid, _match_id, _m.request_id, _m.freelancer_id, true)
      ON CONFLICT (team_id, request_id, freelancer_id) DO NOTHING;
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
  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _bal < _cost THEN RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal,0); END IF;

  INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
    VALUES (_uid, _match_id, _m.request_id, _m.freelancer_id, false);
  UPDATE public.matches SET revealed_by_team = true WHERE id = _match_id;
  _bal := public.credit_tokens(_uid, -_cost, 'team_reveal_spend'::public.token_reason, _match_id, 'Unlock candidate');
  RETURN _bal;
END; $function$;

UPDATE public.platform_settings
   SET label = 'Free candidate previews per match type',
       description = 'Number of highest-ranked external candidates automatically unlocked for free in EACH match list (Full and Partial). Pool members are always free and do not consume these slots.'
 WHERE key = 'free_preview_count';

SELECT public.recompute_matches(NULL, NULL);
