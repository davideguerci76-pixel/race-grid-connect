
-- 1. Matching weights singleton
CREATE TABLE IF NOT EXISTS public.matching_weights (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  role_weight numeric NOT NULL DEFAULT 38,
  skills_weight numeric NOT NULL DEFAULT 25,
  disciplines_weight numeric NOT NULL DEFAULT 12,
  day_rate_weight numeric NOT NULL DEFAULT 9,
  languages_weight numeric NOT NULL DEFAULT 7,
  education_weight numeric NOT NULL DEFAULT 5,
  location_weight numeric NOT NULL DEFAULT 4,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.matching_weights TO authenticated;
GRANT ALL ON public.matching_weights TO service_role;
ALTER TABLE public.matching_weights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "weights_read" ON public.matching_weights;
CREATE POLICY "weights_read" ON public.matching_weights FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "weights_admin_update" ON public.matching_weights;
CREATE POLICY "weights_admin_update" ON public.matching_weights FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.matching_weights(id) VALUES (true) ON CONFLICT DO NOTHING;

-- 2. Extend matches
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS match_score numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missing_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_perfect boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS matches_request_score_idx ON public.matches(request_id, match_score DESC);

-- 3. Match unlocks ledger
CREATE TABLE IF NOT EXISTS public.match_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL,
  free_preview boolean NOT NULL DEFAULT false,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, match_id)
);
GRANT SELECT, INSERT ON public.match_unlocks TO authenticated;
GRANT ALL ON public.match_unlocks TO service_role;
ALTER TABLE public.match_unlocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unlocks_team_read" ON public.match_unlocks;
CREATE POLICY "unlocks_team_read" ON public.match_unlocks FOR SELECT TO authenticated USING (auth.uid() = team_id);

-- 4. Rewrite recompute_matches with weighted scoring + hard filters
CREATE OR REPLACE FUNCTION public.recompute_matches(_freelancer_id uuid DEFAULT NULL, _request_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inserted_count int := 0;
BEGIN
  WITH w AS (SELECT * FROM public.matching_weights WHERE id = true),
  scored AS (
    SELECT
      fp.user_id AS freelancer_id, r.team_id, r.id AS request_id,
      (SELECT COUNT(*)::int FROM public.availability a
        WHERE a.freelancer_id = fp.user_id AND (
          (r.season_dates IS NOT NULL AND array_length(r.season_dates,1) > 0 AND a.day = ANY(r.season_dates))
          OR ((r.season_dates IS NULL OR array_length(r.season_dates,1) IS NULL) AND a.day BETWEEN r.start_date AND r.end_date)
        )
      ) AS overlap_days,
      CASE
        WHEN r.season_dates IS NOT NULL AND array_length(r.season_dates,1) > 0 THEN array_length(r.season_dates,1)
        ELSE GREATEST(1, (r.end_date - r.start_date + 1))
      END AS required_days,
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
  hard AS (
    SELECT s.*,
      (COALESCE(r_role_hard,true) = false OR f_role = r_role) AS pass_role,
      (r_travel_required = false OR f_travels = true) AS pass_travel,
      (COALESCE(array_length(r_skills_hard,1),0) = 0 OR f_skills @> r_skills_hard) AS pass_skills,
      (overlap_days >= required_days) AS pass_dates,
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
    FROM scored s
  ),
  valid AS (
    SELECT * FROM hard WHERE pass_role AND pass_travel AND pass_skills AND pass_dates AND pass_exp AND pass_langs
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
  final AS (
    SELECT freelancer_id, team_id, request_id, overlap_days,
      LEAST(100, ROUND(role_s + skills_s + disc_s + rate_s + langs_s + edu_s + loc_s, 2)) AS match_score,
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
        || (CASE WHEN edu_s = 0 AND COALESCE(array_length(r_edu,1),0) > 0 THEN jsonb_build_array(jsonb_build_object('kind','education')) ELSE '[]'::jsonb END)
        || (CASE WHEN rate_s < day_rate_weight THEN jsonb_build_array(jsonb_build_object('kind','day_rate')) ELSE '[]'::jsonb END)
        || (CASE WHEN loc_s < location_weight THEN jsonb_build_array(jsonb_build_object('kind','location','label',r_loc)) ELSE '[]'::jsonb END)
      ) AS missing_criteria
    FROM parts
  ),
  deleted AS (
    DELETE FROM public.matches m
    WHERE (_freelancer_id IS NULL OR m.freelancer_id = _freelancer_id)
      AND (_request_id IS NULL OR m.request_id = _request_id)
      AND NOT EXISTS (SELECT 1 FROM final f WHERE f.freelancer_id = m.freelancer_id AND f.request_id = m.request_id)
    RETURNING 1
  )
  INSERT INTO public.matches (freelancer_id, team_id, request_id, overlap_days, score, match_score, missing_criteria, is_perfect)
  SELECT freelancer_id, team_id, request_id, overlap_days, overlap_days::numeric, match_score, missing_criteria, (match_score >= 100)
  FROM final
  ON CONFLICT (freelancer_id, request_id) DO UPDATE
    SET overlap_days = EXCLUDED.overlap_days,
        score = EXCLUDED.score,
        match_score = EXCLUDED.match_score,
        missing_criteria = EXCLUDED.missing_criteria,
        is_perfect = EXCLUDED.is_perfect;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END; $$;

-- 5. unlock_match_for_team RPC (1 token, first 3 free)
CREATE OR REPLACE FUNCTION public.unlock_match_for_team(_match_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _m public.matches%ROWTYPE;
  _rank int;
  _bal int;
  _already boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _m.team_id <> _uid THEN RAISE EXCEPTION 'Not owner'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.match_unlocks WHERE team_id = _uid AND match_id = _match_id) INTO _already;
  IF _already THEN
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;

  SELECT COUNT(*) + 1 INTO _rank FROM public.matches
    WHERE request_id = _m.request_id
      AND (match_score > _m.match_score OR (match_score = _m.match_score AND created_at < _m.created_at));

  IF _rank <= 3 THEN
    INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
    VALUES (_uid, _match_id, _m.request_id, _m.freelancer_id, true);
    UPDATE public.matches SET revealed_by_team = true WHERE id = _match_id;
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;

  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal < 1 THEN RAISE EXCEPTION 'Insufficient tokens: need 1 but balance is %', COALESCE(_bal,0); END IF;

  INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
  VALUES (_uid, _match_id, _m.request_id, _m.freelancer_id, false);
  UPDATE public.matches SET revealed_by_team = true WHERE id = _match_id;
  _bal := public.credit_tokens(_uid, -1, 'team_reveal_spend'::public.token_reason, _match_id, 'Unlock candidate');
  RETURN _bal;
END; $$;

-- 6. Recompute all matches with new scoring
SELECT public.recompute_matches(NULL, NULL);
