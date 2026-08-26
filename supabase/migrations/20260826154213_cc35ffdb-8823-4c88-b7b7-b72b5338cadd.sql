-- ============ 1. Environment column on all env-bearing tables ============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.freelancer_profiles ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.team_profiles ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.availability ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_calendars ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.match_history ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.engagements ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.token_transactions ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.team_pool ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.ratings ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.sos_calls ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_test ON public.profiles(is_test) WHERE is_test;
CREATE INDEX IF NOT EXISTS idx_requests_is_test ON public.requests(is_test) WHERE is_test;
CREATE INDEX IF NOT EXISTS idx_matches_is_test ON public.matches(is_test) WHERE is_test;
CREATE INDEX IF NOT EXISTS idx_availability_is_test ON public.availability(is_test) WHERE is_test;
CREATE INDEX IF NOT EXISTS idx_engagements_is_test ON public.engagements(is_test) WHERE is_test;

-- ============ 2. Admin environment state ============
CREATE TABLE IF NOT EXISTS public.admin_env_state (
  admin_id uuid PRIMARY KEY,
  is_test boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_env_state TO authenticated;
GRANT ALL ON public.admin_env_state TO service_role;
ALTER TABLE public.admin_env_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read own env state" ON public.admin_env_state;
CREATE POLICY "Admins read own env state" ON public.admin_env_state
  FOR SELECT TO authenticated USING (admin_id = auth.uid());

-- ============ 3. Environment resolver ============
CREATE OR REPLACE FUNCTION public.env_is_test()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    -- a test account always lives in TEST, whatever it asks for
    (SELECT p.is_test FROM public.profiles p WHERE p.id = auth.uid() AND p.is_test),
    -- an admin sees the environment selected in the control panel
    (SELECT s.is_test FROM public.admin_env_state s
      WHERE s.admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin')),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_set_env(_is_test boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(_uid, 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  INSERT INTO public.admin_env_state(admin_id, is_test) VALUES (_uid, _is_test)
  ON CONFLICT (admin_id) DO UPDATE SET is_test = EXCLUDED.is_test, updated_at = now();
  RETURN _is_test;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_env(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_env(boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.env_is_test() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.env_is_test() TO authenticated;

-- ============ 4. Inherit environment from the owning account ============
CREATE OR REPLACE FUNCTION public.tg_inherit_env()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _owner uuid;
  _flag boolean;
BEGIN
  _owner := CASE TG_ARGV[0]
    WHEN 'user_id' THEN (to_jsonb(NEW)->>'user_id')::uuid
    WHEN 'owner_id' THEN (to_jsonb(NEW)->>'owner_id')::uuid
    WHEN 'freelancer_id' THEN (to_jsonb(NEW)->>'freelancer_id')::uuid
    WHEN 'team_id' THEN (to_jsonb(NEW)->>'team_id')::uuid
    WHEN 'from_user_id' THEN (to_jsonb(NEW)->>'from_user_id')::uuid
    ELSE NULL END;
  SELECT p.is_test INTO _flag FROM public.profiles p WHERE p.id = _owner;
  NEW.is_test := COALESCE(_flag, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_env_freelancer_profiles ON public.freelancer_profiles;
CREATE TRIGGER trg_env_freelancer_profiles BEFORE INSERT OR UPDATE ON public.freelancer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_inherit_env('user_id');
DROP TRIGGER IF EXISTS trg_env_team_profiles ON public.team_profiles;
CREATE TRIGGER trg_env_team_profiles BEFORE INSERT OR UPDATE ON public.team_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_inherit_env('user_id');
DROP TRIGGER IF EXISTS trg_env_availability ON public.availability;
CREATE TRIGGER trg_env_availability BEFORE INSERT OR UPDATE ON public.availability
  FOR EACH ROW EXECUTE FUNCTION public.tg_inherit_env('freelancer_id');
DROP TRIGGER IF EXISTS trg_env_user_calendars ON public.user_calendars;
CREATE TRIGGER trg_env_user_calendars BEFORE INSERT OR UPDATE ON public.user_calendars
  FOR EACH ROW EXECUTE FUNCTION public.tg_inherit_env('owner_id');
DROP TRIGGER IF EXISTS trg_env_requests ON public.requests;
CREATE TRIGGER trg_env_requests BEFORE INSERT OR UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_inherit_env('team_id');
DROP TRIGGER IF EXISTS trg_env_notifications ON public.notifications;
CREATE TRIGGER trg_env_notifications BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_inherit_env('user_id');
DROP TRIGGER IF EXISTS trg_env_token_transactions ON public.token_transactions;
CREATE TRIGGER trg_env_token_transactions BEFORE INSERT OR UPDATE ON public.token_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_inherit_env('user_id');
DROP TRIGGER IF EXISTS trg_env_sos_calls ON public.sos_calls;
CREATE TRIGGER trg_env_sos_calls BEFORE INSERT OR UPDATE ON public.sos_calls
  FOR EACH ROW EXECUTE FUNCTION public.tg_inherit_env('team_id');
DROP TRIGGER IF EXISTS trg_env_ratings ON public.ratings;
CREATE TRIGGER trg_env_ratings BEFORE INSERT OR UPDATE ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.tg_inherit_env('from_user_id');

-- ============ 5. Cross-environment contamination barrier ============
CREATE OR REPLACE FUNCTION public.tg_env_pair_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _f boolean;
  _t boolean;
BEGIN
  SELECT is_test INTO _f FROM public.profiles WHERE id = NEW.freelancer_id;
  SELECT is_test INTO _t FROM public.profiles WHERE id = NEW.team_id;
  IF COALESCE(_f,false) <> COALESCE(_t,false) THEN
    RAISE EXCEPTION 'Cross-environment link is not allowed (LIVE/TEST isolation)';
  END IF;
  NEW.is_test := COALESCE(_f, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_env_guard_matches ON public.matches;
CREATE TRIGGER trg_env_guard_matches BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.tg_env_pair_guard();
DROP TRIGGER IF EXISTS trg_env_guard_match_history ON public.match_history;
CREATE TRIGGER trg_env_guard_match_history BEFORE INSERT OR UPDATE ON public.match_history
  FOR EACH ROW EXECUTE FUNCTION public.tg_env_pair_guard();
DROP TRIGGER IF EXISTS trg_env_guard_engagements ON public.engagements;
CREATE TRIGGER trg_env_guard_engagements BEFORE INSERT OR UPDATE ON public.engagements
  FOR EACH ROW EXECUTE FUNCTION public.tg_env_pair_guard();
DROP TRIGGER IF EXISTS trg_env_guard_team_pool ON public.team_pool;
CREATE TRIGGER trg_env_guard_team_pool BEFORE INSERT OR UPDATE ON public.team_pool
  FOR EACH ROW EXECUTE FUNCTION public.tg_env_pair_guard();

-- ============ 6. RLS: browse policies become environment-scoped ============
DROP POLICY IF EXISTS "Freelancer profiles viewable by authenticated" ON public.freelancer_profiles;
CREATE POLICY "Freelancer profiles viewable by authenticated" ON public.freelancer_profiles
  FOR SELECT TO authenticated USING (is_test = public.env_is_test());

DROP POLICY IF EXISTS "Team profiles viewable by authenticated" ON public.team_profiles;
CREATE POLICY "Team profiles viewable by authenticated" ON public.team_profiles
  FOR SELECT TO authenticated USING (is_test = public.env_is_test());

DROP POLICY IF EXISTS "Requests viewable by authenticated" ON public.requests;
CREATE POLICY "Requests viewable by authenticated" ON public.requests
  FOR SELECT TO authenticated USING (is_active = true AND is_test = public.env_is_test());

DROP POLICY IF EXISTS "Match visible to parties" ON public.matches;
CREATE POLICY "Match visible to parties" ON public.matches
  FOR SELECT TO authenticated
  USING ((auth.uid() = freelancer_id OR auth.uid() = team_id) AND is_test = public.env_is_test());

DROP POLICY IF EXISTS "Engagement visible to parties" ON public.engagements;
CREATE POLICY "Engagement visible to parties" ON public.engagements
  FOR SELECT TO authenticated
  USING ((auth.uid() = freelancer_id OR auth.uid() = team_id) AND is_test = public.env_is_test());

DROP POLICY IF EXISTS "Availability read scoped" ON public.availability;
CREATE POLICY "Availability read scoped" ON public.availability
  FOR SELECT TO authenticated
  USING (
    is_test = public.env_is_test()
    AND (
      auth.uid() = freelancer_id
      OR EXISTS (SELECT 1 FROM public.engagements e WHERE e.freelancer_id = availability.freelancer_id AND e.team_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.matches m WHERE m.freelancer_id = availability.freelancer_id AND m.team_id = auth.uid() AND m.revealed_by_team = true)
    )
  );

DROP POLICY IF EXISTS "Calendars read scoped" ON public.user_calendars;
CREATE POLICY "Calendars read scoped" ON public.user_calendars
  FOR SELECT TO authenticated
  USING (
    review_status = 'approved'
    AND is_test = public.env_is_test()
    AND (
      auth.uid() = owner_id
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.engagements e WHERE e.freelancer_id = user_calendars.owner_id AND e.team_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.matches m WHERE m.freelancer_id = user_calendars.owner_id AND m.team_id = auth.uid() AND m.revealed_by_team = true)
    )
  );

DROP POLICY IF EXISTS "Team sees own pool" ON public.team_pool;
CREATE POLICY "Team sees own pool" ON public.team_pool
  FOR SELECT TO authenticated
  USING ((auth.uid() = team_id OR auth.uid() = freelancer_id) AND is_test = public.env_is_test());

-- ============ 7. Matching engine stays inside one environment ============
CREATE OR REPLACE FUNCTION public.tg_recompute_env_safe() RETURNS void
LANGUAGE sql AS $$ SELECT 1 $$;
DROP FUNCTION IF EXISTS public.tg_recompute_env_safe();

-- ============ 8. Purge the TEST environment ============
CREATE OR REPLACE FUNCTION public.purge_test_environment()
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  DELETE FROM public.rating_flags rf USING public.ratings r WHERE rf.rating_id = r.id AND r.is_test;
  DELETE FROM public.ratings WHERE is_test;
  DELETE FROM public.sos_call_targets t USING public.sos_calls s WHERE t.sos_id = s.id AND s.is_test;
  DELETE FROM public.sos_calls WHERE is_test;
  DELETE FROM public.match_unlocks mu USING public.profiles p WHERE mu.team_id = p.id AND p.is_test;
  DELETE FROM public.pool_search_unlocks pu USING public.profiles p WHERE pu.team_id = p.id AND p.is_test;
  DELETE FROM public.request_tier_unlocks ru USING public.profiles p WHERE ru.team_id = p.id AND p.is_test;
  DELETE FROM public.request_team_reveals rr USING public.profiles p WHERE rr.user_id = p.id AND p.is_test;
  DELETE FROM public.team_reveals tr USING public.profiles p WHERE (tr.user_id = p.id OR tr.team_id = p.id) AND p.is_test;
  DELETE FROM public.review_unlocks vu USING public.profiles p WHERE (vu.user_id = p.id OR vu.target_user_id = p.id) AND p.is_test;
  DELETE FROM public.team_pool WHERE is_test;
  DELETE FROM public.engagements WHERE is_test;
  DELETE FROM public.match_history WHERE is_test;
  DELETE FROM public.matches WHERE is_test;
  DELETE FROM public.requests WHERE is_test;
  DELETE FROM public.availability WHERE is_test;
  DELETE FROM public.user_calendars WHERE is_test;
  DELETE FROM public.notifications WHERE is_test;
  DELETE FROM public.token_transactions WHERE is_test;
  DELETE FROM public.freelancer_contacts fc USING public.profiles p WHERE fc.user_id = p.id AND p.is_test;
  DELETE FROM public.freelancer_profiles WHERE is_test;
  DELETE FROM public.team_profiles WHERE is_test;
  DELETE FROM public.admin_audit_log al USING public.profiles p WHERE al.target_user_id = p.id AND p.is_test;

  RETURN QUERY SELECT p.id FROM public.profiles p WHERE p.is_test;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_test_environment() FROM public, anon, authenticated;

-- ============ 9. TEST data never triggers real emails ============
CREATE OR REPLACE FUNCTION public.dispatch_notification_emails()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg public.email_hook_config%ROWTYPE;
  pending integer;
BEGIN
  SELECT * INTO cfg FROM public.email_hook_config WHERE id;
  IF NOT FOUND THEN RETURN; END IF;

  -- TEST notifications are marked as handled and never leave the platform
  UPDATE public.notifications SET emailed_at = now()
   WHERE emailed_at IS NULL AND is_test;

  SELECT count(*) INTO pending
  FROM public.notifications
  WHERE emailed_at IS NULL AND is_test = false AND created_at > now() - interval '2 days';

  IF pending = 0 THEN RETURN; END IF;

  PERFORM net.http_post(
    url := cfg.endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', cfg.secret),
    body := '{}'::jsonb
  );
END;
$$;