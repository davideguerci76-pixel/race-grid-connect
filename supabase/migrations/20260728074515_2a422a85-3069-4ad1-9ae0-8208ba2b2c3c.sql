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
    _cost := ROUND(_tier_base)::int;
  ELSE
    -- Nearest-integer rounding, with minimum 1 token so a real tier is never free.
    _cost := GREATEST(1, ROUND(_tier_base * _slots::numeric / _size::numeric)::int);
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