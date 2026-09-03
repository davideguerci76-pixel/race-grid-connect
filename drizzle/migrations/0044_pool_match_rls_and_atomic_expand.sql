-- 1) Pool match boundary: a team owner may only read matches of freelancers in its own pool
--    when the request is an "IN MY POOL" search. Standard requests keep current behaviour.
CREATE OR REPLACE FUNCTION public.team_can_see_match(_team uuid, _request uuid, _freelancer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (SELECT r.search_mode FROM public.requests r WHERE r.id = _request) = 'pool'
      THEN EXISTS (
        SELECT 1 FROM public.team_pool tp
        WHERE tp.team_id = _team AND tp.freelancer_id = _freelancer
      )
    ELSE true
  END;
$$;

REVOKE ALL ON FUNCTION public.team_can_see_match(uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.team_can_see_match(uuid, uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Match visible to parties" ON public.matches;
CREATE POLICY "Match visible to parties"
ON public.matches
FOR SELECT
USING (
  (is_test = public.env_is_test())
  AND (
    ((auth.uid() = team_id) AND public.team_can_see_match(team_id, request_id, freelancer_id))
    OR ((auth.uid() = freelancer_id) AND public.freelancer_match_actionable(auth.uid(), request_id))
  )
);

-- 2) Atomic, idempotent, race-safe Expand to PITCALL (pool -> standard).
--    Same eligibility, same server-side price, single debit, single transformation.
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

  -- Serialize concurrent Expand attempts on the same pit call.
  PERFORM pg_advisory_xact_lock(hashtextextended('expand_request', 0), hashtextextended(_request_id::text, 0));

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