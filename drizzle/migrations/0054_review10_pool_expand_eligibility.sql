-- REVIEW10: expose only a server-authoritative boolean for Pool -> Standard Expand.
-- Existing Pool match visibility and commercial behavior remain unchanged.
CREATE OR REPLACE FUNCTION public.request_expand_eligibility(_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req public.requests%ROWTYPE;
  _threshold numeric;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO _req
  FROM public.requests
  WHERE id = _request_id
  FOR SHARE;

  IF NOT FOUND OR _req.team_id <> _uid OR _req.is_test <> public.env_is_test()
     OR _req.search_mode IS DISTINCT FROM 'pool' OR NOT _req.is_active THEN
    RETURN false;
  END IF;

  _threshold := COALESCE(public.get_setting_num('professional_relevance_threshold', 50), 50);

  RETURN EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.request_id = _request_id
      AND m.team_id = _uid
      AND m.is_test = public.env_is_test()
      AND m.stale = false
      AND m.overlap_days > 0
      AND m.skills_score >= _threshold
      AND NOT EXISTS (
        SELECT 1
        FROM public.team_pool tp
        WHERE tp.team_id = _uid
          AND tp.freelancer_id = m.freelancer_id
          AND tp.is_test = public.env_is_test()
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_expand_eligibility(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_expand_eligibility(uuid) TO authenticated, service_role;

-- Keep the existing atomic, idempotent, ownership-checked Expand flow, adding
-- the same eligibility gate at the transaction boundary.
CREATE OR REPLACE FUNCTION public.upgrade_request_to_standard(_request_id uuid)
RETURNS TABLE(tokens_spent integer, already boolean, balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req public.requests%ROWTYPE;
  _cost int;
  _bal int;
  _threshold numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('expand_request:' || _request_id::text, 0));

  SELECT * INTO _req FROM public.requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _req.team_id <> _uid THEN RAISE EXCEPTION 'Not owner of this request'; END IF;
  IF _req.is_test <> public.env_is_test() THEN RAISE EXCEPTION 'Not owner of this request'; END IF;

  IF _req.search_mode IS DISTINCT FROM 'pool' THEN
    SELECT p.token_balance INTO _bal FROM public.profiles p WHERE p.id = _uid;
    RETURN QUERY SELECT 0, true, COALESCE(_bal, 0);
    RETURN;
  END IF;

  _threshold := COALESCE(public.get_setting_num('professional_relevance_threshold', 50), 50);
  IF NOT EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.request_id = _request_id
      AND m.team_id = _uid
      AND m.is_test = public.env_is_test()
      AND m.stale = false
      AND m.overlap_days > 0
      AND m.skills_score >= _threshold
      AND NOT EXISTS (
        SELECT 1
        FROM public.team_pool tp
        WHERE tp.team_id = _uid
          AND tp.freelancer_id = m.freelancer_id
          AND tp.is_test = public.env_is_test()
      )
  ) THEN
    RAISE EXCEPTION 'Expand is not available for this Pit Call';
  END IF;

  _cost := GREATEST(0, ROUND(
    (CASE WHEN _req.duration = 'full_season'
       THEN public.get_setting_num('cost_request_full_season', 20)
       ELSE public.get_setting_num('cost_request_race_weekend', 10)
     END)
    - public.get_setting_num('cost_pool_search', 5)
  ))::int;

  SELECT p.token_balance INTO _bal FROM public.profiles p WHERE p.id = _uid FOR UPDATE;
  IF COALESCE(_bal, 0) < _cost THEN
    RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal, 0);
  END IF;

  IF _cost > 0 THEN
    _bal := public.credit_tokens(_uid, -_cost, 'request_post'::public.token_reason, _request_id,
                                 'Upgrade My Pool Pit Call to standard search');
  END IF;

  UPDATE public.requests
     SET search_mode = 'standard', updated_at = now()
   WHERE id = _request_id;

  RETURN QUERY SELECT _cost, false, COALESCE(_bal, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.upgrade_request_to_standard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upgrade_request_to_standard(uuid) TO authenticated, service_role;