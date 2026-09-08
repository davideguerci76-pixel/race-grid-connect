-- STEP 6.10.R — My Pool provenance & economic collision remediation
-- 1) unlock_pool_search: positive authority — only genuine Pool-origin pit calls (search_mode='pool').
-- 2) remove_pool_member: owner-only, idempotent removal of the CURRENT pool relationship,
--    denied while a genuine active Pool-origin dependency exists.
-- 3) add_pool_member_by_code: creates ONLY the pool relationship (no synthetic 'pool_manual' engagement).

CREATE OR REPLACE FUNCTION public.unlock_pool_search(_request_id uuid)
 RETURNS TABLE(tokens_spent integer, balance integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r public.requests%ROWTYPE;
  _cost int;
  _bal int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _r FROM public.requests
  WHERE id = _request_id AND team_id = _uid AND is_test = public.env_is_test()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not owner of this pit call'; END IF;

  -- Positive economic authority: the Pool unlock price exists only for Pool-origin pit calls.
  -- A standard pit call already paid its publication; comparing it with My Pool is free.
  IF COALESCE(_r.search_mode, 'standard') <> 'pool' THEN
    RAISE EXCEPTION 'POOL_UNLOCK_NOT_APPLICABLE: pool unlock applies only to My Pool pit calls';
  END IF;

  IF EXISTS (SELECT 1 FROM public.pool_search_unlocks WHERE team_id = _uid AND request_id = _request_id) THEN
    SELECT p.token_balance INTO _bal FROM public.profiles p WHERE p.id = _uid;
    RETURN QUERY SELECT 0, _bal;
    RETURN;
  END IF;

  _cost := public.get_setting_num('cost_pool_search', 5)::int;
  SELECT p.token_balance INTO _bal FROM public.profiles p WHERE p.id = _uid;
  IF _bal < _cost THEN RAISE EXCEPTION 'Not enough tokens'; END IF;

  _bal := public.credit_tokens(_uid, -_cost, 'reveal_spend'::public.token_reason, _request_id, 'My Pool search');

  INSERT INTO public.pool_search_unlocks(team_id, request_id, tokens_spent)
  VALUES (_uid, _request_id, _cost);

  RETURN QUERY SELECT _cost, _bal;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_pool_member(_freelancer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _deleted int := 0;
  _active_dep uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND user_type = 'team') THEN
    RAISE EXCEPTION 'Only teams have a pool';
  END IF;

  -- Serialize with concurrent add/remove for the same pair.
  PERFORM pg_advisory_xact_lock(hashtext('team_pool:' || _uid::text || ':' || _freelancer_id::text));

  -- Genuine active Pool-origin dependency: on a Pool-origin pit call that is still open,
  -- match visibility (team_can_see_match) and candidate eligibility depend on CURRENT membership.
  SELECT r.id INTO _active_dep
  FROM public.requests r
  WHERE r.team_id = _uid
    AND r.search_mode = 'pool'
    AND r.status IN ('pending_review', 'active', 'paused')
    AND (
      EXISTS (SELECT 1 FROM public.matches m
              WHERE m.request_id = r.id AND m.freelancer_id = _freelancer_id AND m.stale = false)
      OR EXISTS (SELECT 1 FROM public.engagements e
                 WHERE e.request_id = r.id AND e.freelancer_id = _freelancer_id
                   AND e.status IN ('proposed', 'confirmed'))
    )
  LIMIT 1;

  IF _active_dep IS NOT NULL THEN
    RAISE EXCEPTION 'POOL_ACTIVE_DEPENDENCY: freelancer is involved in an active My Pool search';
  END IF;

  DELETE FROM public.team_pool
  WHERE team_id = _uid AND freelancer_id = _freelancer_id AND is_test = public.env_is_test();
  GET DIAGNOSTICS _deleted = ROW_COUNT;

  RETURN jsonb_build_object('removed', _deleted > 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_pool_member(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.remove_pool_member(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_pool_member_by_code(_code text)
 RETURNS team_pool
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _f uuid;
  _row public.team_pool;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND user_type = 'team') THEN
    RAISE EXCEPTION 'Only teams have a pool';
  END IF;

  SELECT user_id INTO _f FROM public.freelancer_profiles
  WHERE upper(pit_code) = upper(btrim(_code));
  IF _f IS NULL THEN RAISE EXCEPTION 'No freelancer found for this code'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('team_pool:' || _uid::text || ':' || _f::text));

  -- Add to Pool is a relationship, not an engagement: never fabricate engagements,
  -- ratings or rating notifications here.
  INSERT INTO public.team_pool(team_id, freelancer_id, source)
  VALUES (_uid, _f, 'code')
  ON CONFLICT (team_id, freelancer_id) DO UPDATE SET source = public.team_pool.source
  RETURNING * INTO _row;

  RETURN _row;
END;
$function$;