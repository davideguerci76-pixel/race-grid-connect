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

REVOKE ALL ON FUNCTION public.upgrade_request_to_standard(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.upgrade_request_to_standard(uuid) TO authenticated, service_role;