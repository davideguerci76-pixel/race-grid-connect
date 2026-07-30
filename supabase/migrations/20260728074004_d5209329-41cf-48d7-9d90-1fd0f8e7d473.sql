
-- 1. Settings
INSERT INTO public.platform_settings(key, value_num, category, label, description, unit, sort_order) VALUES
  ('cost_tier2_entry', 5, 'costs', 'Unlock tier 2 (matches 11–20)', 'One-time token cost to unlock the second block of matches for a request. Scaled proportionally when fewer than 20 matches exist.', 'tokens', 100),
  ('cost_tier3_entry', 25, 'costs', 'Unlock tier 3 (matches 21–50)', 'One-time token cost to unlock the deep block of matches for a request. Scaled proportionally when fewer than 50 matches exist.', 'tokens', 101),
  ('tier2_size', 10, 'costs', 'Tier 2 size', 'Number of match slots in the second block. Used for proportional pricing.', 'slots', 200),
  ('tier3_size', 30, 'costs', 'Tier 3 size', 'Number of match slots in the third block. Used for proportional pricing.', 'slots', 201),
  ('hard_cap_matches', 50, 'costs', 'Hard cap on matches per request', 'Absolute maximum number of matches exposed for a single request. Nothing beyond this rank is ever surfaced.', 'matches', 202)
ON CONFLICT (key) DO NOTHING;

-- 2. Table
CREATE TABLE public.request_tier_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  tier SMALLINT NOT NULL CHECK (tier IN (2,3)),
  tokens_spent INTEGER NOT NULL DEFAULT 0,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, request_id, tier)
);

GRANT SELECT ON public.request_tier_unlocks TO authenticated;
GRANT ALL ON public.request_tier_unlocks TO service_role;

ALTER TABLE public.request_tier_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_read_own_tier_unlocks" ON public.request_tier_unlocks
  FOR SELECT TO authenticated USING (team_id = auth.uid());

-- 3. RPC: unlock a tier
CREATE OR REPLACE FUNCTION public.unlock_request_tier(_request_id UUID, _tier INT)
RETURNS TABLE(tier INT, tokens_spent INT, balance INT, total_matches INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _team UUID;
  _total INT;
  _tier2_size INT;
  _tier3_size INT;
  _cap INT;
  _tier_base NUMERIC;
  _slots INT;
  _size INT;
  _cost INT;
  _bal INT;
  _existing public.request_tier_unlocks%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _tier NOT IN (2,3) THEN RAISE EXCEPTION 'Invalid tier'; END IF;

  SELECT team_id INTO _team FROM public.requests WHERE id = _request_id;
  IF _team IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _team <> _uid THEN RAISE EXCEPTION 'Not owner of this request'; END IF;

  SELECT * INTO _existing FROM public.request_tier_unlocks
    WHERE team_id = _uid AND request_id = _request_id AND request_tier_unlocks.tier = _tier;
  IF FOUND THEN
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    SELECT COUNT(*)::int INTO _total FROM public.matches WHERE request_id = _request_id;
    RETURN QUERY SELECT _tier, _existing.tokens_spent, _bal, LEAST(_total, COALESCE((SELECT get_setting_num('hard_cap_matches',50))::int,50));
    RETURN;
  END IF;

  _cap := COALESCE(public.get_setting_num('hard_cap_matches', 50)::int, 50);
  _tier2_size := COALESCE(public.get_setting_num('tier2_size', 10)::int, 10);
  _tier3_size := COALESCE(public.get_setting_num('tier3_size', 30)::int, 30);

  SELECT COUNT(*)::int INTO _total FROM public.matches WHERE request_id = _request_id;
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
    _cost := _tier_base::int;
  ELSE
    _cost := GREATEST(1, CEIL(_tier_base * _slots::numeric / _size::numeric)::int);
  END IF;

  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < _cost THEN
    RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal, 0);
  END IF;

  _bal := public.credit_tokens(_uid, -_cost, 'team_reveal_spend'::public.token_reason, _request_id, 'Unlock tier ' || _tier || ' for request');

  INSERT INTO public.request_tier_unlocks(team_id, request_id, tier, tokens_spent)
    VALUES (_uid, _request_id, _tier, _cost);

  RETURN QUERY SELECT _tier, _cost, _bal, _total;
END; $$;

REVOKE EXECUTE ON FUNCTION public.unlock_request_tier(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_request_tier(UUID, INT) TO authenticated;

-- 4. Update unlock_match_for_team: enforce hard cap + tier gating
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
      WHERE team_id = _uid AND request_id = _m.request_id AND tier = _tier_needed
    ) INTO _tier_ok;
    IF NOT _tier_ok THEN
      RAISE EXCEPTION 'Tier % not unlocked for this request', _tier_needed;
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
