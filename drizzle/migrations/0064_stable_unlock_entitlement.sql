-- STEP 11.4D — FND-5: stable unlock entitlement (team_id + request_id + freelancer_id)

-- 1) match_id becomes a non-destructive technical reference
ALTER TABLE public.match_unlocks ALTER COLUMN match_id DROP NOT NULL;
ALTER TABLE public.match_unlocks DROP CONSTRAINT IF EXISTS match_unlocks_match_id_fkey;
ALTER TABLE public.match_unlocks
  ADD CONSTRAINT match_unlocks_match_id_fkey
  FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE SET NULL;

-- 2) collapse historical duplicates on the stable triple, preferring the paid entitlement
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY team_id, request_id, freelancer_id
           ORDER BY free_preview ASC, unlocked_at ASC, id ASC
         ) AS rn
  FROM public.match_unlocks
)
DELETE FROM public.match_unlocks u
USING ranked r
WHERE u.id = r.id AND r.rn > 1;

-- 3) stable identity
ALTER TABLE public.match_unlocks DROP CONSTRAINT IF EXISTS match_unlocks_team_id_match_id_key;
ALTER TABLE public.match_unlocks
  ADD CONSTRAINT match_unlocks_team_request_freelancer_key
  UNIQUE (team_id, request_id, freelancer_id);

-- 4) authoritative unlock: pool members always free, configurable free preview count on externals
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

  -- serialize concurrent unlocks of the same stable entitlement
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

  SELECT COUNT(*) + 1 INTO _rank FROM public.matches
    WHERE request_id = _m.request_id
      AND is_partial = _m.is_partial
      AND (final_score > _m.final_score OR (final_score = _m.final_score AND created_at < _m.created_at));

  _cap := COALESCE(public.get_setting_num('hard_cap_matches', 50)::int, 50);
  IF _rank > _cap THEN RAISE EXCEPTION 'Match beyond the hard cap'; END IF;

  _tier2_size := COALESCE(public.get_setting_num('tier2_size', 10)::int, 10);
  _free_n := GREATEST(0, COALESCE(public.get_setting_num('free_preview_count', 3)::int, 3));

  -- rank among candidates outside the team pool only
  SELECT COUNT(*) + 1 INTO _ext_rank FROM public.matches m2
    WHERE m2.request_id = _m.request_id
      AND m2.is_partial = _m.is_partial
      AND (m2.final_score > _m.final_score OR (m2.final_score = _m.final_score AND m2.created_at < _m.created_at))
      AND NOT EXISTS (
        SELECT 1 FROM public.team_pool tp
        WHERE tp.team_id = _uid AND tp.freelancer_id = m2.freelancer_id
          AND tp.is_test = public.env_is_test()
      );

  IF _ext_rank <= _free_n THEN
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