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
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Serialise concurrent / replayed deletion attempts for this account.
  PERFORM pg_advisory_xact_lock(hashtextextended('delete-account:' || _uid::text, 0));

  SELECT deleted_at INTO _already FROM public.profiles WHERE id = _uid;

  IF _already IS NOT NULL THEN
    -- Replay: DB side already done, only the auth identity may remain.
    RETURN jsonb_build_object('ok', true, 'replay', true, 'state', 'db_purged');
  END IF;

  -- Guards evaluated BEFORE any destructive effect.
  SELECT count(*) INTO _open
  FROM public.engagements e
  WHERE (e.freelancer_id = _uid OR e.team_id = _uid)
    AND e.status IN ('proposed', 'confirmed');

  IF _open > 0 THEN
    RAISE EXCEPTION 'ACTIVE_ENGAGEMENTS';
  END IF;

  -- W1-N3: a Team cannot delete while it still owns operational Pit Calls.
  -- Operational statuses: pending_review (auto-activates), active, paused
  -- (owner-resumable). Terminal: closed, completed, filled.
  SELECT count(*) INTO _open_requests
  FROM public.requests r
  WHERE r.team_id = _uid
    AND r.status IN ('pending_review', 'active', 'paused');

  IF _open_requests > 0 THEN
    RAISE EXCEPTION 'OPEN_PIT_CALLS_EXIST';
  END IF;

  -- Owner-private data: removed.
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

  -- Shared content: de-identified, not destroyed.
  UPDATE public.ratings SET comment = NULL WHERE from_user_id = _uid;

  UPDATE public.profiles
     SET display_name = 'Deleted user',
         first_name = NULL,
         last_name = NULL,
         avatar_url = NULL,
         blocked_at = COALESCE(blocked_at, now()),
         deleted_at = now(),
         deletion_state = 'db_purged'
   WHERE id = _uid;

  RETURN jsonb_build_object('ok', true, 'replay', false, 'state', 'db_purged');
END;
$function$;