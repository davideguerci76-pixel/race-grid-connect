-- REM-W1: account deletion authority, user_type immutability, block enforcement

-- 1. Recognisable deletion state -------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deletion_state text;

-- 2. user_type immutable forever -------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_profiles_authority_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Immutable for EVERY caller, including service_role / admin paths.
  IF NEW.user_type IS DISTINCT FROM OLD.user_type THEN
    RAISE EXCEPTION 'Forbidden: user_type is immutable';
  END IF;

  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.token_balance IS DISTINCT FROM OLD.token_balance
     OR NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.deletion_state IS DISTINCT FROM OLD.deletion_state
     OR NEW.is_test IS DISTINCT FROM OLD.is_test
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.terms_accepted_at IS DISTINCT FROM OLD.terms_accepted_at
     OR NEW.privacy_accepted_at IS DISTINCT FROM OLD.privacy_accepted_at
     OR NEW.legal_version IS DISTINCT FROM OLD.legal_version THEN
    RAISE EXCEPTION 'Forbidden: server-authoritative profile field';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Central "is this account allowed to act" predicate ---------------------
CREATE OR REPLACE FUNCTION public.user_is_blocked(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND (p.blocked_at IS NOT NULL OR p.deleted_at IS NOT NULL)
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_is_blocked(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_account_status()
RETURNS TABLE (blocked boolean, deleted boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (p.blocked_at IS NOT NULL), (p.deleted_at IS NOT NULL)
  FROM public.profiles p WHERE p.id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.my_account_status() TO authenticated, service_role;

-- 4. Blocked / deleted accounts cannot mutate their own data ----------------
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id AND NOT public.user_is_blocked(auth.uid()))
  WITH CHECK (auth.uid() = id AND NOT public.user_is_blocked(auth.uid()));

DROP POLICY IF EXISTS "Freelancer manages own availability" ON public.availability;
CREATE POLICY "Freelancer manages own availability" ON public.availability
  FOR ALL USING (auth.uid() = freelancer_id AND is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()))
  WITH CHECK (auth.uid() = freelancer_id AND is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()));

DROP POLICY IF EXISTS "own notes insert" ON public.calendar_day_notes;
CREATE POLICY "own notes insert" ON public.calendar_day_notes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = freelancer_id AND is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()));

DROP POLICY IF EXISTS "own notes update" ON public.calendar_day_notes;
CREATE POLICY "own notes update" ON public.calendar_day_notes
  FOR UPDATE TO authenticated
  USING (auth.uid() = freelancer_id AND is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()))
  WITH CHECK (auth.uid() = freelancer_id AND is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()));

DROP POLICY IF EXISTS "own notes delete" ON public.calendar_day_notes;
CREATE POLICY "own notes delete" ON public.calendar_day_notes
  FOR DELETE TO authenticated
  USING (auth.uid() = freelancer_id AND is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()));

DROP POLICY IF EXISTS "Billing insert own" ON public.billing_details;
CREATE POLICY "Billing insert own" ON public.billing_details
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND NOT public.user_is_blocked(auth.uid()));

DROP POLICY IF EXISTS "Billing update own" ON public.billing_details;
CREATE POLICY "Billing update own" ON public.billing_details
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND NOT public.user_is_blocked(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND NOT public.user_is_blocked(auth.uid()));

DROP POLICY IF EXISTS "own contacts insert" ON public.freelancer_contacts;
CREATE POLICY "own contacts insert" ON public.freelancer_contacts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT public.user_is_blocked(auth.uid()));

DROP POLICY IF EXISTS "own contacts update" ON public.freelancer_contacts;
CREATE POLICY "own contacts update" ON public.freelancer_contacts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND NOT public.user_is_blocked(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND NOT public.user_is_blocked(auth.uid()));

DROP POLICY IF EXISTS "own contacts delete" ON public.freelancer_contacts;
CREATE POLICY "own contacts delete" ON public.freelancer_contacts
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND NOT public.user_is_blocked(auth.uid()));

DROP POLICY IF EXISTS "Freelancer manages own" ON public.freelancer_profiles;
CREATE POLICY "Freelancer manages own" ON public.freelancer_profiles
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND NOT public.user_is_blocked(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND NOT public.user_is_blocked(auth.uid()));

DROP POLICY IF EXISTS "Team manages own" ON public.team_profiles;
CREATE POLICY "Team manages own" ON public.team_profiles
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND NOT public.user_is_blocked(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND NOT public.user_is_blocked(auth.uid()));

DROP POLICY IF EXISTS "Owners create their calendars" ON public.user_calendars;
CREATE POLICY "Owners create their calendars" ON public.user_calendars
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND COALESCE(review_status, 'private') <> 'approved' AND NOT public.user_is_blocked(auth.uid()));

DROP POLICY IF EXISTS "Owners update unapproved calendars" ON public.user_calendars;
CREATE POLICY "Owners update unapproved calendars" ON public.user_calendars
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id AND review_status <> 'approved' AND NOT public.user_is_blocked(auth.uid()))
  WITH CHECK (auth.uid() = owner_id AND review_status <> 'approved' AND NOT public.user_is_blocked(auth.uid()));

DROP POLICY IF EXISTS "Owners delete unapproved calendars" ON public.user_calendars;
CREATE POLICY "Owners delete unapproved calendars" ON public.user_calendars
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id AND review_status <> 'approved' AND NOT public.user_is_blocked(auth.uid()));

-- 5. Server-authoritative, idempotent account deletion ----------------------
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _open int;
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

  -- Guard evaluated BEFORE any destructive effect.
  SELECT count(*) INTO _open
  FROM public.engagements e
  WHERE (e.freelancer_id = _uid OR e.team_id = _uid)
    AND e.status IN ('proposed', 'confirmed');

  IF _open > 0 THEN
    RAISE EXCEPTION 'ACTIVE_ENGAGEMENTS';
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

  -- Economic / legal / audit history is intentionally preserved:
  -- token_transactions, token_orders, requests, matches, engagements,
  -- ratings rows, legal_acceptances, billing_details, admin_audit_log.

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
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_account_identity_deleted(_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET deletion_state = 'complete' WHERE id = _user_id AND deleted_at IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.mark_account_identity_deleted(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_account_identity_deleted(uuid) TO service_role;
