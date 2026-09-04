-- STEP 11.4D: fair deterministic ranking + per-scope free previews

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

-- Persist per-criterion contributions from recompute_matches without re-authoring its scoring SQL.
DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.recompute_matches(uuid,uuid)'::regprocedure);
  IF position('criteria_contributions' in d) = 0 THEN
    d := replace(d,
      'AS missing_criteria' || chr(10) || '    FROM filtered',
      'AS missing_criteria,' || chr(10) ||
      '      jsonb_build_object(''sub_role'', ROUND(subrole_s,4), ''skills'', ROUND(skills_s,4), ''disciplines'', ROUND(disc_s,4), ''day_rate'', ROUND(rate_s,4), ''languages'', ROUND(langs_s,4), ''location'', ROUND(loc_s,4), ''education'', ROUND(edu_s,4)) AS criteria_contributions' || chr(10) ||
      '    FROM filtered');
    d := replace(d, 'skills_score, final_score)' || chr(10) || '  SELECT',
                    'skills_score, final_score, criteria_contributions)' || chr(10) || '  SELECT');
    d := replace(d, 'is_partial, edge_only, skills_score, final_score' || chr(10) || '  FROM final',
                    'is_partial, edge_only, skills_score, final_score, criteria_contributions' || chr(10) || '  FROM final');
    d := replace(d, 'final_score = EXCLUDED.final_score;',
                    'final_score = EXCLUDED.final_score, criteria_contributions = EXCLUDED.criteria_contributions;');
    IF position('criteria_contributions' in d) = 0 THEN
      RAISE EXCEPTION 'recompute_matches patch failed';
    END IF;
    EXECUTE d;
  END IF;
END $mig$;

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

  -- Deterministic unique position inside the scope list (full or partial):
  -- total relevance DESC, then per-criterion contributions ordered by current ACP weights,
  -- finally freelancer_id ASC as stable technical tie-break.
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

  -- Free quota is per match type: first N external FULL and first N external PARTIAL.
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
