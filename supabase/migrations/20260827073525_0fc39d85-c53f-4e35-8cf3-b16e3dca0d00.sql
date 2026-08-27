-- 1. New dedicated confirmation timestamp
ALTER TABLE public.freelancer_profiles
  ADD COLUMN IF NOT EXISTS calendar_last_confirmed_at timestamptz;

-- 2. Centralised thresholds
INSERT INTO public.platform_settings (key, value_num, category, label, description, unit, sort_order) VALUES
  ('availability_fresh_days', 45, 'calendar', 'Availability fresh window', 'Days an availability stays FRESH after its last confirmation', 'days', 1),
  ('availability_review_days', 45, 'calendar', 'Needs review after', 'Age at which an availability enters NEEDS REVIEW (still used for matching)', 'days', 2),
  ('availability_max_age_days', 90, 'calendar', 'Availability max age', 'Age after which an availability is no longer used for matching until confirmed', 'days', 3)
ON CONFLICT (key) DO NOTHING;

-- 3. Index for freshness scans
CREATE INDEX IF NOT EXISTS availability_freelancer_created_idx ON public.availability (freelancer_id, created_at);

-- 4. Single source of truth: is a declared day actually matchable?
CREATE OR REPLACE FUNCTION public.day_blocked_by_engagement(_freelancer uuid, _day date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.engagements e
    LEFT JOIN public.requests r ON r.id = e.request_id
    WHERE e.freelancer_id = _freelancer
      AND e.status IN ('confirmed','completed')
      AND (
        CASE
          WHEN r.season_dates IS NOT NULL AND cardinality(r.season_dates) > 0
            THEN _day = ANY(r.season_dates)
          ELSE _day BETWEEN COALESCE(r.start_date, e.start_date) AND COALESCE(r.end_date, e.end_date)
        END
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.availability_day_active(_freelancer uuid, _day date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.availability a
    JOIN public.freelancer_profiles fp ON fp.user_id = a.freelancer_id
    WHERE a.freelancer_id = _freelancer
      AND a.day = _day
      AND a.day >= public.sim_now()::date
      AND GREATEST(COALESCE(fp.calendar_last_confirmed_at, '-infinity'::timestamptz), a.created_at)
          > public.sim_now() - (COALESCE(public.get_setting_num('availability_max_age_days', 90), 90) || ' days')::interval
  )
  AND NOT public.day_blocked_by_engagement(_freelancer, _day);
$$;

REVOKE ALL ON FUNCTION public.day_blocked_by_engagement(uuid, date) FROM public, anon;
REVOKE ALL ON FUNCTION public.availability_day_active(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.day_blocked_by_engagement(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.availability_day_active(uuid, date) TO authenticated, service_role;

-- 5. Confirm calendar writes the dedicated timestamp
CREATE OR REPLACE FUNCTION public.confirm_calendar()
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _ts timestamptz := public.sim_now();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.freelancer_profiles
    SET calendar_last_confirmed_at = _ts,
        calendar_last_updated_at = _ts,
        updated_at = now()
    WHERE user_id = _uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no freelancer profile';
  END IF;
  PERFORM public.recompute_matches(_uid, NULL);
  RETURN _ts;
END;
$$;

-- 6. Edge-only detection uses the same matchable definition
CREATE OR REPLACE FUNCTION public.match_edge_only(_freelancer uuid, _required date[])
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    _has_a := public.availability_day_active(_freelancer, _d);
    IF _has_a THEN EXIT; END IF;
    _prefix := _prefix + 1;
  END LOOP;

  IF _prefix = _n THEN RETURN true; END IF;

  FOR _i IN REVERSE _n..1 LOOP
    _d := _sorted[_i];
    _has_a := public.availability_day_active(_freelancer, _d);
    IF _has_a THEN EXIT; END IF;
    _suffix := _suffix + 1;
  END LOOP;

  FOR _i IN 1.._n LOOP
    _d := _sorted[_i];
    IF NOT public.availability_day_active(_freelancer, _d) THEN _missing := _missing + 1; END IF;
  END LOOP;

  RETURN (_prefix + _suffix) >= _missing;
END;
$$;

-- 7. Matching engine: eligibility gate + no freshness in the score + simulated clock
CREATE OR REPLACE FUNCTION public.recompute_matches(_freelancer_id uuid DEFAULT NULL::uuid, _request_id uuid DEFAULT NULL::uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inserted_count int := 0;
  _pen_single numeric := COALESCE(public.get_setting_num('partial_single_penalty_per_day', 10), 10);
  _max_single numeric := COALESCE(public.get_setting_num('partial_single_max_missing_pct', 30), 30);
  _max_season numeric := COALESCE(public.get_setting_num('partial_season_max_missing_pct', 20), 20);
  _now timestamptz := public.sim_now();
  _today date := public.sim_now()::date;
  _cutoff timestamptz := public.sim_now() - (COALESCE(public.get_setting_num('availability_max_age_days', 90), 90) || ' days')::interval;
BEGIN
  WITH w AS (SELECT * FROM public.matching_weights WHERE id = true),
  scored AS (
    SELECT
      fp.user_id AS freelancer_id, r.team_id, r.id AS request_id,
      COALESCE(r.search_mode, 'standard') AS search_mode,
      EXISTS (
        SELECT 1
        FROM public.team_pool pool
        WHERE pool.team_id = r.team_id
          AND pool.freelancer_id = fp.user_id
      ) AS is_pool_member,
      CASE
        WHEN r.season_dates IS NOT NULL AND array_length(r.season_dates,1) > 0
          THEN r.season_dates
        ELSE ARRAY(SELECT (r.start_date + n)::date FROM generate_series(0, (r.end_date - r.start_date)) n)
      END AS required_days_arr,
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
    SELECT s.*,
      CASE WHEN s.r_loc_anchor = 'team' THEN s.t_lat ELSE s.r_lat END AS anchor_lat,
      CASE WHEN s.r_loc_anchor = 'team' THEN s.t_lng ELSE s.r_lng END AS anchor_lng
    FROM scored s
  ),
  dist AS (
    SELECT g.*,
      public.haversine_km(g.f_lat, g.f_lng, g.anchor_lat, g.anchor_lng) AS distance_km
    FROM geo g
  ),
  ovl AS (
    SELECT s.*,
      COALESCE(array_length(s.required_days_arr,1), 0) AS required_days,
      (SELECT COUNT(*)::int FROM unnest(s.required_days_arr) d
         WHERE EXISTS(
           SELECT 1 FROM public.availability a
           WHERE a.freelancer_id = s.freelancer_id
             AND a.day = d
             AND a.day >= _today
             AND GREATEST(COALESCE(s.f_cal_confirmed, '-infinity'::timestamptz), a.created_at) > _cutoff
         )
         AND NOT public.day_blocked_by_engagement(s.freelancer_id, d)
      ) AS overlap_days,
      (SELECT MAX(CASE lower(coalesce(sr->>'level','')) WHEN 'junior' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'senior' THEN 3 ELSE 1 END)
         FROM jsonb_array_elements(s.f_sub_roles) sr
         WHERE sr->>'sub_role' = s.r_sub_role) AS f_sub_rank,
      (CASE lower(coalesce(s.r_sub_level,'junior')) WHEN 'junior' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'senior' THEN 3 ELSE 1 END) AS r_sub_rank
    FROM dist s
  ),
  hard AS (
    SELECT s.*,
      (s.r_group IS NULL OR s.f_group = s.r_group) AS pass_group,
      (s.r_sub_hard = false OR s.r_sub_role IS NULL OR s.f_sub_rank IS NOT NULL) AS pass_sub_role,
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
      ) AS pass_langs,
      (
        s.r_loc_rel <> 'mandatory'
        OR s.anchor_lat IS NULL OR s.anchor_lng IS NULL
        OR s.f_lat IS NULL OR s.f_lng IS NULL
        OR s.r_loc_radius IS NULL
        OR (s.distance_km IS NOT NULL AND s.distance_km <= s.r_loc_radius)
      ) AS pass_geo
    FROM ovl s
  ),
  valid AS (
    SELECT * FROM hard
    WHERE pass_group AND pass_sub_role AND pass_travel AND pass_skills AND pass_exp AND pass_langs AND pass_geo
      AND required_days > 0
      AND overlap_days > 0
  ),
  parts AS (
    SELECT v.*,
      CASE
        WHEN r_sub_role IS NULL THEN sub_role_weight
        WHEN f_sub_rank IS NULL THEN 0
        WHEN f_sub_rank >= r_sub_rank THEN sub_role_weight * (level_exact_pct / 100.0)
        WHEN r_sub_rank - f_sub_rank = 1 THEN sub_role_weight * (level_one_below_pct / 100.0)
        ELSE sub_role_weight * (level_two_below_pct / 100.0)
      END AS subrole_s,
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
        WHEN r_loc_rel = 'not_relevant' THEN location_weight
        WHEN anchor_lat IS NULL OR anchor_lng IS NULL OR f_lat IS NULL OR f_lng IS NULL OR r_loc_radius IS NULL THEN location_weight * 0.5
        WHEN distance_km IS NULL THEN location_weight * 0.5
        WHEN distance_km <= r_loc_radius THEN location_weight
        WHEN distance_km <= r_loc_radius * 1.2 THEN location_weight * 0.5
        ELSE 0
      END AS loc_s
    FROM valid v
  ),
  computed AS (
    SELECT p.*,
      LEAST(100, ROUND(subrole_s + skills_s + disc_s + rate_s + langs_s + edu_s + loc_s, 2)) AS skills_score_v,
      (required_days - overlap_days) AS missing_days_v,
      ROUND(((required_days - overlap_days)::numeric / NULLIF(required_days,0)) * 100, 2) AS missing_pct_v
    FROM parts p
  ),
  filtered AS (
    SELECT c.*
    FROM computed c
    WHERE
      CASE WHEN c.missing_days_v = 0 THEN TRUE
           WHEN c.search_mode = 'pool' AND c.is_pool_member THEN TRUE
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
        (CASE WHEN r_sub_role IS NOT NULL AND subrole_s < sub_role_weight
              THEN jsonb_build_array(jsonb_build_object('kind','sub_role','label',r_sub_role,'level',r_sub_level,'hard',r_sub_hard))
              ELSE '[]'::jsonb END)
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
        || (CASE WHEN loc_s < location_weight THEN jsonb_build_array(jsonb_build_object('kind','location','label',r_loc,'distance_km', ROUND(distance_km,1))) ELSE '[]'::jsonb END)
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
END;
$$;

-- 8. Engagements change matchable availability -> recompute
CREATE OR REPLACE FUNCTION public.tg_recompute_on_engagement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _f uuid := COALESCE(NEW.freelancer_id, OLD.freelancer_id);
  _old text := COALESCE(OLD.status::text, '');
  _new text := COALESCE(NEW.status::text, '');
BEGIN
  IF (_old IN ('confirmed','completed')) IS DISTINCT FROM (_new IN ('confirmed','completed')) THEN
    PERFORM public.recompute_matches(_f, NULL);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS engagements_recompute ON public.engagements;
CREATE TRIGGER engagements_recompute
AFTER INSERT OR UPDATE OF status OR DELETE ON public.engagements
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_on_engagement();

-- 9. Notifications based on affected future dates, gentle tone, simulated clock
CREATE OR REPLACE FUNCTION public.emit_calendar_stale_notifications()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inserted_count int := 0;
  now_ts timestamptz := public.sim_now();
  _review numeric := COALESCE(public.get_setting_num('availability_review_days', 45), 45);
  _max numeric := COALESCE(public.get_setting_num('availability_max_age_days', 90), 90);
BEGIN
  WITH rows AS (
    SELECT a.freelancer_id,
           GREATEST(COALESCE(fp.calendar_last_confirmed_at, '-infinity'::timestamptz), a.created_at) AS eff
    FROM public.availability a
    JOIN public.freelancer_profiles fp ON fp.user_id = a.freelancer_id
    WHERE a.day >= now_ts::date
  ),
  agg AS (
    SELECT freelancer_id,
      COUNT(*) FILTER (WHERE eff <= now_ts - (_max || ' days')::interval)::int AS unconfirmed_days,
      COUNT(*) FILTER (WHERE eff <= now_ts - (_review || ' days')::interval)::int AS review_days
    FROM rows
    GROUP BY freelancer_id
  ),
  candidates AS (
    SELECT freelancer_id,
      CASE WHEN unconfirmed_days > 0 THEN 'unconfirmed' ELSE 'needs_review' END AS state,
      GREATEST(unconfirmed_days, review_days) AS affected_days
    FROM agg
    WHERE review_days > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = agg.freelancer_id
          AND n.kind = 'calendar_stale'
          AND n.created_at > (now_ts - interval '30 days')
      )
  ), ins AS (
    INSERT INTO public.notifications (user_id, kind, payload)
    SELECT freelancer_id, 'calendar_stale',
           jsonb_build_object('message','calendar_stale_benefit','state',state,'affected_days',affected_days)
    FROM candidates
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM ins;
  RETURN inserted_count;
END;
$$;

-- 10. Transition: nobody becomes unconfirmed on deploy day
UPDATE public.freelancer_profiles
SET calendar_last_confirmed_at = GREATEST(COALESCE(calendar_last_updated_at, now()), now() - interval '30 days')
WHERE calendar_last_confirmed_at IS NULL;