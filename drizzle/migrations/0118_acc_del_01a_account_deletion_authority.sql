-- ACC-DEL-01.A — account deletion vs frozen availability.
-- Explicit, transaction-local account-deletion context. It can only be set by
-- the SECURITY DEFINER deletion authorities below; a normal authenticated
-- client (PostgREST) cannot execute SET / set_config, and a plain service-role
-- session does NOT get the bypass unless it goes through those functions.

CREATE OR REPLACE FUNCTION public.account_deletion_context()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT NULLIF(current_setting('pitcall.account_deletion_uid', true), '')::uuid
$$;

REVOKE ALL ON FUNCTION public.account_deletion_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_deletion_context() TO authenticated, service_role;

-- Frozen-availability protection stays fully active for every normal path.
-- The ONLY exemption is a DELETE of the very rows belonging to the account
-- currently being deleted inside the authorized deletion transaction.
CREATE OR REPLACE FUNCTION public.tg_protect_frozen_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE'
     AND public.account_deletion_context() IS NOT NULL
     AND public.account_deletion_context() = OLD.freelancer_id THEN
    RETURN OLD;
  END IF;

  IF public.day_frozen_by_pending_request(OLD.freelancer_id, OLD.day) THEN
    RAISE EXCEPTION 'Availability locked while a Pit Call request is awaiting your response'
      USING ERRCODE = '55006';
  END IF;
  IF public.day_blocked_by_engagement(OLD.freelancer_id, OLD.day) THEN
    RAISE EXCEPTION 'Availability locked by a confirmed engagement'
      USING ERRCODE = '55006';
  END IF;
  RETURN OLD;
END;
$function$;

-- Retention safety gate (STEP 4): reports records that must NOT be destroyed.
-- No deletion, no cascade, no trigger relaxation — read only.
CREATE OR REPLACE FUNCTION public.account_retention_records(_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'token_orders',       (SELECT count(*) FROM public.token_orders       WHERE (team_id = _user_id OR created_by = _user_id) AND is_test = false),
    'token_transactions', (SELECT count(*) FROM public.token_transactions WHERE user_id = _user_id AND is_test = false),
    'legal_acceptances',  (SELECT count(*) FROM public.legal_acceptances  WHERE user_id = _user_id AND is_test = false)
  )
$$;

REVOKE ALL ON FUNCTION public.account_retention_records(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_retention_records(uuid) TO authenticated, service_role;

-- Shared cleanup / de-identification authority used by BOTH entry points.
-- It contains NO eligibility rule: who may delete stays with the callers.
CREATE OR REPLACE FUNCTION public.account_deletion_cleanup(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _retained jsonb;
  _has_retained boolean;
BEGIN
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

REVOKE ALL ON FUNCTION public.account_deletion_cleanup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_deletion_cleanup(uuid) TO service_role;

-- SELF-DELETE: eligibility guards unchanged (ACTIVE_ENGAGEMENTS,
-- OPEN_PIT_CALLS_EXIST, advisory lock, replay idempotency).
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

  _res := public.account_deletion_cleanup(_uid);

  RETURN _res || jsonb_build_object('ok', true, 'replay', false);
END;
$function$;

-- ADMIN DELETE: administrative authority (no self-service eligibility guards),
-- but the SAME controlled cleanup / de-identification / retention gate.
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

  _res := public.account_deletion_cleanup(_user_id);

  RETURN _res || jsonb_build_object('ok', true, 'replay', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_account(uuid) TO authenticated, service_role;