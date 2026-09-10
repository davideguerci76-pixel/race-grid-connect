-- ACC-DEL-01.A.SEC — close privilege escalation on account_deletion_cleanup.
-- 1) The helper leaves the PostgREST-exposed schema (public) and lives in a
--    private schema with NO EXECUTE grant to anyone: only its owner (postgres),
--    i.e. the SECURITY DEFINER authorities, can run it.
-- 2) Independent of grants, the helper verifies its immediate PL/pgSQL caller
--    frame (PG_CONTEXT, not forgeable by a client) AND re-checks the identity
--    rules of that authority (self: _uid = auth.uid(); admin: has_role admin).
-- Retention gate (0119), frozen-context bypass, guards: unchanged.

CREATE SCHEMA IF NOT EXISTS pitcall_internal AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA pitcall_internal FROM PUBLIC;
REVOKE ALL ON SCHEMA pitcall_internal FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION pitcall_internal.account_deletion_cleanup(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ctx text;
  _caller text;
  _retained jsonb;
  _has_retained boolean;
BEGIN
  -- Structural barrier: immediate caller must be one of the two authorities.
  GET DIAGNOSTICS _ctx = PG_CONTEXT;
  _caller := split_part(_ctx, E'\n', 2);

  IF _caller ~ '^PL/pgSQL function public\.delete_my_account\(\) line [0-9]+ at ' THEN
    IF auth.uid() IS NULL OR _uid IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'ACCOUNT_DELETION_CLEANUP_UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;
  ELSIF _caller ~ '^PL/pgSQL function public\.admin_delete_account\(uuid\) line [0-9]+ at ' THEN
    IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') OR _uid = auth.uid() THEN
      RAISE EXCEPTION 'ACCOUNT_DELETION_CLEANUP_UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'ACCOUNT_DELETION_CLEANUP_INTERNAL_ONLY' USING ERRCODE = '42501';
  END IF;

  -- Narrow, transaction-local deletion context (is_local = true).
  PERFORM set_config('pitcall.account_deletion_uid', _uid::text, true);

  DELETE FROM public.push_deliveries d
    USING public.push_subscriptions s
    WHERE d.subscription_id = s.id AND s.user_id = _uid;
  DELETE FROM public.push_subscriptions WHERE user_id = _uid;
  DELETE FROM public.availability WHERE freelancer_id = _uid;
  DELETE FROM public.calendar_day_notes WHERE freelancer_id = _uid;
  DELETE FROM public.user_calendars WHERE owner_id = _uid;
  DELETE FROM public.freelancer_contacts WHERE user_id = _uid;
  DELETE FROM public.freelancer_profiles WHERE user_id = _uid;
  DELETE FROM public.team_profiles WHERE user_id = _uid;
  DELETE FROM public.notifications WHERE user_id = _uid;
  DELETE FROM public.team_pool WHERE freelancer_id = _uid OR team_id = _uid;

  UPDATE public.ratings SET comment = NULL WHERE from_user_id = _uid;

  _retained := public.account_retention_records(_uid);
  _has_retained := (
    (_retained->>'token_orders')::int
    + (_retained->>'token_transactions')::int
    + (_retained->>'legal_acceptances')::int
  ) > 0;

  UPDATE public.profiles
     SET display_name = 'Deleted user',
         first_name = NULL,
         last_name = NULL,
         avatar_url = NULL,
         blocked_at = COALESCE(blocked_at, now()),
         deleted_at = now(),
         deletion_state = CASE WHEN _has_retained THEN 'db_purged_retained' ELSE 'db_purged' END
   WHERE id = _uid;

  PERFORM set_config('pitcall.account_deletion_uid', '', true);

  RETURN jsonb_build_object(
    'state', CASE WHEN _has_retained THEN 'db_purged_retained' ELSE 'db_purged' END,
    'identity_hard_delete_allowed', NOT _has_retained,
    'retained', _retained
  );
END;
$function$;

-- No EXECUTE for anyone but the owner: not anon, not authenticated, not service_role.
REVOKE ALL ON FUNCTION pitcall_internal.account_deletion_cleanup(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION pitcall_internal.account_deletion_cleanup(uuid) FROM anon, authenticated, service_role;

-- Remove the exposed public RPC entirely.
DROP FUNCTION IF EXISTS public.account_deletion_cleanup(uuid);

-- Authorities: same bodies/guards, now calling the internal helper.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _open int;
  _open_requests int;
  _already timestamptz;
  _state text;
  _res jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('delete-account:' || _uid::text, 0));

  SELECT deleted_at, deletion_state INTO _already, _state FROM public.profiles WHERE id = _uid;

  IF _already IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'replay', true, 'state', COALESCE(_state, 'db_purged'),
      'identity_hard_delete_allowed',
        (public.account_retention_records(_uid) = jsonb_build_object('token_orders',0,'token_transactions',0,'legal_acceptances',0))
    );
  END IF;

  SELECT count(*) INTO _open
  FROM public.engagements e
  WHERE (e.freelancer_id = _uid OR e.team_id = _uid)
    AND e.status IN ('proposed', 'confirmed');

  IF _open > 0 THEN
    RAISE EXCEPTION 'ACTIVE_ENGAGEMENTS';
  END IF;

  SELECT count(*) INTO _open_requests
  FROM public.requests r
  WHERE r.team_id = _uid
    AND r.status IN ('pending_review', 'active', 'paused');

  IF _open_requests > 0 THEN
    RAISE EXCEPTION 'OPEN_PIT_CALLS_EXIST';
  END IF;

  _res := pitcall_internal.account_deletion_cleanup(_uid);

  RETURN _res || jsonb_build_object('ok', true, 'replay', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_account(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _already timestamptz;
  _state text;
  _res jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'SELF_DELETE_NOT_ALLOWED_HERE';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('delete-account:' || _user_id::text, 0));

  SELECT deleted_at, deletion_state INTO _already, _state FROM public.profiles WHERE id = _user_id;

  IF _already IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'replay', true, 'state', COALESCE(_state, 'db_purged'),
      'identity_hard_delete_allowed',
        (public.account_retention_records(_user_id) = jsonb_build_object('token_orders',0,'token_transactions',0,'legal_acceptances',0))
    );
  END IF;

  _res := pitcall_internal.account_deletion_cleanup(_user_id);

  RETURN _res || jsonb_build_object('ok', true, 'replay', false);
END;
$function$;

-- Grant hygiene on the public-facing surface (defense in depth only).
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_account(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.account_retention_records(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_context() FROM PUBLIC, anon, authenticated;