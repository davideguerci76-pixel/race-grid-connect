-- REVIEW08.2 — Aggregate Availability Opportunity notifications per Freelancer per run.
-- One Freelancer-facing notification lists each Pit Call's own days separately.
-- Eligibility, gates, threshold, dedup/one-shot state and env isolation are unchanged.

CREATE OR REPLACE FUNCTION public.emit_availability_opportunity_notifications(_is_test boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
  _sent integer := 0;
  _threshold numeric := COALESCE(public.get_setting_num('professional_relevance_threshold', 50), 50);
  _today date := now()::date;
  _cutoff timestamptz := now() - (COALESCE(public.get_setting_num('availability_max_age_days', 90), 90) || ' days')::interval;
  _agg jsonb := '{}'::jsonb;
  _fid text;
  _entries jsonb;
BEGIN
  FOR _row IN
    WITH w AS (SELECT * FROM public.matching_weights WHERE id = true),
    scored AS (
      SELECT
        fp.user_id AS freelancer_id,
        r.id AS request_id,
        public.request_required_days(r.id) AS required_days_arr,
        fp.role_group AS f_group, r.role_group AS r_group,
        COALESCE(fp.sub_roles, '[]'::jsonb) AS f_sub_roles,
        r.sub_role AS r_sub_role,
        COALESCE(r.sub_role_min_level, 'junior') AS r_sub_level,
        COALESCE(r.sub_role_hard, false) AS r_sub_hard,
        COALESCE(fp.skills, '{}')::text[] AS f_skills,
        COALESCE(r.skills, '{}')::text[] AS r_skills_soft,
        COALESCE(r.skills_hard, '{}')::text[] AS r_skills_hard,
        fp.disciplines, r.discipline,
        fp.day_rate AS f_rate, r.budget_max AS r_budget_max,
        fp.education AS f_edu, r.education AS r_edu,
        COALESCE(fp.experiences, '[]'::jsonb) AS f_exps,
        COALESCE(r.experience_requirements, '[]'::jsonb) AS r_exp_reqs,
        COALESCE(fp.languages, '[]'::jsonb) AS f_langs,
        COALESCE(r.languages, '[]'::jsonb) AS r_langs,
        COALESCE(fp.travels, false) AS f_travels,
        COALESCE(r.travel_required, true) AS r_travel_required,
        fp.location_lat AS f_lat, fp.location_lng AS f_lng,
        r.location_lat AS r_lat, r.location_lng AS r_lng,
        COALESCE(r.location_relevance, 'not_relevant') AS r_loc_rel,
        COALESCE(r.location_anchor, 'this') AS r_loc_anchor,
        r.location_radius_km AS r_loc_radius,
        tp.location_lat AS t_lat, tp.location_lng AS t_lng,
        fp.calendar_last_confirmed_at AS f_cal_confirmed,
        w.*
      FROM public.requests r
      CROSS JOIN w
      JOIN public.freelancer_profiles fp ON fp.is_test = _is_test
      LEFT JOIN public.team_profiles tp ON tp.user_id = r.team_id
      WHERE r.is_test = _is_test
        AND r.is_active = true
        AND r.status = 'active'
        AND r.activated_at IS NOT NULL
        AND COALESCE(r.was_pool_request, false) = false
        AND COALESCE(r.search_mode, 'standard') <> 'pool'
    ),
    geo AS (
      SELECT s.*,
        CASE WHEN s.r_loc_anchor = 'team' THEN s.t_lat ELSE s.r_lat END AS anchor_lat,
        CASE WHEN s.r_loc_anchor = 'team' THEN s.t_lng ELSE s.r_lng END AS anchor_lng
      FROM scored s
    ),
    dist AS (
      SELECT g.*, public.haversine_km(g.f_lat, g.f_lng, g.anchor_lat, g.anchor_lng) AS distance_km
      FROM geo g
    ),
    ovl AS (
      SELECT s.*, COALESCE(array_length(s.required_days_arr, 1), 0) AS required_days,
        (SELECT COUNT(*)::int
         FROM unnest(s.required_days_arr) d
         WHERE EXISTS (
           SELECT 1 FROM public.availability a
           WHERE a.freelancer_id = s.freelancer_id
             AND a.day = d
             AND a.day >= _today
             AND GREATEST(COALESCE(s.f_cal_confirmed, '-infinity'::timestamptz), a.created_at) > _cutoff
         )
         AND NOT public.day_blocked_by_engagement(s.freelancer_id, d)) AS overlap_days,
        (SELECT COUNT(*)::int
         FROM unnest(s.required_days_arr) d
         WHERE EXISTS (
           SELECT 1 FROM public.availability a
           WHERE a.freelancer_id = s.freelancer_id AND a.day = d AND a.day >= _today
         )) AS raw_overlap_days,
        (SELECT MAX(CASE lower(coalesce(sr->>'level', ''))
          WHEN 'junior' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'senior' THEN 3 ELSE 1 END)
         FROM jsonb_array_elements(s.f_sub_roles) sr
         WHERE sr->>'sub_role' = s.r_sub_role) AS f_sub_rank,
        (CASE lower(coalesce(s.r_sub_level, 'junior'))
          WHEN 'junior' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'senior' THEN 3 ELSE 1 END) AS r_sub_rank
      FROM dist s
    ),
    hard AS (
      SELECT s,
        (s.r_group IS NULL OR s.f_group = s.r_group) AS pass_group,
        (s.r_sub_hard = false OR s.r_sub_role IS NULL OR s.f_sub_rank IS NOT NULL) AS pass_sub_role,
        (s.r_travel_required = false OR s.f_travels = true) AS pass_travel,
        (COALESCE(array_length(s.r_skills_hard, 1), 0) = 0 OR s.f_skills @> s.r_skills_hard) AS pass_skills,
        NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(s.r_exp_reqs) req
          WHERE COALESCE((req->>'hard')::boolean, false)
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(s.f_exps) exp
              WHERE exp->>'discipline' = req->>'discipline'
                AND COALESCE((exp->>'years')::int, 0) >= COALESCE((req->>'min_years')::int, 0)
            )
        ) AS pass_exp,
        NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(s.r_langs) lreq
          WHERE COALESCE((lreq->>'hard')::boolean, false)
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(s.f_langs) flang
              WHERE lower(coalesce(flang->>'code', '')) = lower(coalesce(lreq->>'code', ''))
                AND (CASE lower(coalesce(flang->>'level', ''))
                  WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3
                  WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 0 END)
                >= (CASE lower(coalesce(lreq->>'level', ''))
                  WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3
                  WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 1 END)
            )
        ) AS pass_langs,
        (s.r_loc_rel <> 'mandatory' OR s.anchor_lat IS NULL OR s.anchor_lng IS NULL
          OR s.f_lat IS NULL OR s.f_lng IS NULL OR s.r_loc_radius IS NULL
          OR (s.distance_km IS NOT NULL AND s.distance_km <= s.r_loc_radius)) AS pass_geo
      FROM ovl s
    ),
    valid AS (
      SELECT (h.s).* , h.pass_group, h.pass_sub_role, h.pass_travel, h.pass_skills,
        h.pass_exp, h.pass_langs, h.pass_geo
      FROM hard h
      WHERE h.pass_group AND h.pass_sub_role AND h.pass_travel AND h.pass_skills
        AND h.pass_exp AND h.pass_langs AND h.pass_geo
        AND (h.s).required_days > 0 AND (h.s).overlap_days = 0
    ),
    parts AS (
      SELECT v.*,
        CASE
          WHEN v.r_sub_role IS NULL THEN v.sub_role_weight
          WHEN v.f_sub_rank IS NULL THEN 0
          WHEN v.f_sub_rank >= v.r_sub_rank THEN v.sub_role_weight * (v.level_exact_pct / 100.0)
          WHEN v.r_sub_rank - v.f_sub_rank = 1 THEN v.sub_role_weight * (v.level_one_below_pct / 100.0)
          ELSE v.sub_role_weight * (v.level_two_below_pct / 100.0)
        END AS subrole_s,
        CASE
          WHEN COALESCE(array_length(v.r_skills_soft, 1), 0) + COALESCE(array_length(v.r_skills_hard, 1), 0) = 0 THEN v.skills_weight
          ELSE v.skills_weight * (
            COALESCE((SELECT COUNT(*)::numeric FROM unnest(v.r_skills_soft || v.r_skills_hard) sk WHERE sk = ANY(v.f_skills)), 0)
            / NULLIF(COALESCE(array_length(v.r_skills_soft, 1), 0) + COALESCE(array_length(v.r_skills_hard, 1), 0), 0)
          )
        END AS skills_s,
        CASE WHEN v.discipline = ANY(v.disciplines) THEN v.disciplines_weight ELSE 0 END AS disc_s,
        CASE
          WHEN v.f_rate IS NULL OR v.r_budget_max IS NULL THEN v.day_rate_weight * 0.5
          WHEN v.f_rate <= v.r_budget_max THEN v.day_rate_weight
          WHEN v.f_rate <= v.r_budget_max * 1.20 THEN v.day_rate_weight * 0.5
          ELSE 0
        END AS rate_s,
        CASE
          WHEN jsonb_array_length(v.r_langs) = 0 THEN v.languages_weight
          ELSE v.languages_weight * (
            (SELECT COUNT(*)::numeric FROM jsonb_array_elements(v.r_langs) lreq
             WHERE EXISTS (
               SELECT 1 FROM jsonb_array_elements(v.f_langs) flang
               WHERE lower(coalesce(flang->>'code', '')) = lower(coalesce(lreq->>'code', ''))
                 AND (CASE lower(coalesce(flang->>'level', ''))
                   WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3
                   WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 0 END)
                 >= (CASE lower(coalesce(lreq->>'level', ''))
                   WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3
                   WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 1 END)
              )) / NULLIF(jsonb_array_length(v.r_langs), 0)::numeric
          )
        END AS langs_s,
        CASE WHEN COALESCE(array_length(v.r_edu, 1), 0) = 0 THEN v.education_weight
          WHEN v.f_edu = ANY(v.r_edu) THEN v.education_weight ELSE 0 END AS edu_s,
        CASE
          WHEN v.r_loc_rel = 'not_relevant' THEN v.location_weight
          WHEN v.anchor_lat IS NULL OR v.anchor_lng IS NULL OR v.f_lat IS NULL OR v.f_lng IS NULL OR v.r_loc_radius IS NULL THEN v.location_weight * 0.5
          WHEN v.distance_km IS NULL THEN v.location_weight * 0.5
          WHEN v.distance_km <= v.r_loc_radius THEN v.location_weight
          WHEN v.distance_km <= v.r_loc_radius * 1.2 THEN v.location_weight * 0.5
          ELSE 0
        END AS loc_s
      FROM valid v
    )
    SELECT p.request_id, p.freelancer_id, p.required_days_arr,
      LEAST(100, ROUND(p.subrole_s + p.skills_s + p.disc_s + p.rate_s + p.langs_s + p.edu_s + p.loc_s, 2)) AS skills_score,
      CASE WHEN p.raw_overlap_days > 0 THEN 'stale_calendar' ELSE 'zero_overlap' END AS reason
    FROM parts p
    WHERE LEAST(100, ROUND(p.subrole_s + p.skills_s + p.disc_s + p.rate_s + p.langs_s + p.edu_s + p.loc_s, 2)) >= _threshold
      AND NOT EXISTS (
        SELECT 1 FROM public.matches m
        WHERE m.request_id = p.request_id AND m.freelancer_id = p.freelancer_id
          AND m.is_test = _is_test AND m.stale = false
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.engagements e
        WHERE e.request_id = p.request_id AND e.freelancer_id = p.freelancer_id
          AND e.is_test = _is_test AND e.status IN ('proposed', 'confirmed', 'completed')
      )
    ORDER BY p.freelancer_id, p.request_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'availability-opportunity:' || _row.request_id::text || ':' || _row.freelancer_id::text || ':' || _is_test::text, 8
    ));

    IF EXISTS (
      SELECT 1 FROM public.availability_opportunity_state s
      WHERE s.request_id = _row.request_id AND s.freelancer_id = _row.freelancer_id
        AND s.is_test = _is_test AND s.notified_at IS NOT NULL
    ) THEN
      CONTINUE;
    END IF;

    -- One-shot per Pit Call + Freelancer, recorded before aggregation.
    INSERT INTO public.availability_opportunity_state (request_id, freelancer_id, is_test, reason, notified_at)
    VALUES (_row.request_id, _row.freelancer_id, _is_test, _row.reason, now())
    ON CONFLICT (request_id, freelancer_id) DO UPDATE SET
      is_test = EXCLUDED.is_test,
      reason = EXCLUDED.reason,
      notified_at = now(),
      updated_at = now();

    -- Aggregate this run's opportunities per Freelancer; each Pit Call keeps its own days.
    _agg := jsonb_set(
      _agg,
      ARRAY[_row.freelancer_id::text],
      COALESCE(_agg -> (_row.freelancer_id::text), '[]'::jsonb) || jsonb_build_object(
        'reason', _row.reason,
        'relevant_days', to_jsonb(_row.required_days_arr),
        'month', to_char(_row.required_days_arr[1], 'YYYY-MM')
      ),
      true
    );
  END LOOP;

  -- One Freelancer-facing notification per Freelancer per run.
  FOR _fid, _entries IN SELECT key, value FROM jsonb_each(_agg)
  LOOP
    INSERT INTO public.notifications (user_id, kind, payload, is_test)
    VALUES (
      _fid::uuid,
      'new_matches',
      jsonb_build_object(
        'audience', 'freelancer',
        'event', 'availability_opportunity',
        'informational', true,
        'opportunities', _entries,
        'opportunity_count', jsonb_array_length(_entries),
        -- Legacy top-level fields from the first entry for backward-compatible rendering.
        'reason', _entries -> 0 ->> 'reason',
        'relevant_days', _entries -> 0 -> 'relevant_days',
        'month', _entries -> 0 ->> 'month'
      ),
      _is_test
    );
    _sent := _sent + 1;
  END LOOP;

  RETURN _sent;
END;
$function$;

REVOKE ALL ON FUNCTION public.emit_availability_opportunity_notifications(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_availability_opportunity_notifications(boolean) TO service_role;