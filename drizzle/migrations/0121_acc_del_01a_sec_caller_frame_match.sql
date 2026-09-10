-- ACC-DEL-01.A.SEC follow-up: PG_CONTEXT prints the caller unqualified when its
-- schema is on search_path ("PL/pgSQL function delete_my_account() line N at ...").
-- Accept exactly public.<authority> or the bare name; any other schema
-- (e.g. pg_temp_N.) is printed qualified and therefore rejected.
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
  GET DIAGNOSTICS _ctx = PG_CONTEXT;
  _caller := split_part(_ctx, E'\n', 2);

  IF _caller ~ '^PL/pgSQL function (public\.)?delete_my_account\(\) line [0-9]+ at ' THEN
    IF auth.uid() IS NULL OR _uid IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'ACCOUNT_DELETION_CLEANUP_UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;
  ELSIF _caller ~ '^PL/pgSQL function (public\.)?admin_delete_account\(uuid\) line [0-9]+ at ' THEN
    IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') OR _uid = auth.uid() THEN
      RAISE EXCEPTION 'ACCOUNT_DELETION_CLEANUP_UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'ACCOUNT_DELETION_CLEANUP_INTERNAL_ONLY' USING ERRCODE = '42501';
  END IF;

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

REVOKE ALL ON FUNCTION pitcall_internal.account_deletion_cleanup(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION pitcall_internal.account_deletion_cleanup(uuid) FROM anon, authenticated, service_role;