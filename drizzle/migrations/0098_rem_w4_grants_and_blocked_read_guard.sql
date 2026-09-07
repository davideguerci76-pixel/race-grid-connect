-- REM-W4: Data API least privilege + blocked/deleted read guard
-- 1) Deny every write path to anon (unauthenticated) except client error reporting.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.%I FROM anon', t.relname);
  END LOOP;
END $$;
GRANT INSERT ON public.client_error_log TO anon;

-- 2) Authenticated: revoke every write, then re-grant only the surfaces the app
--    actually writes through the user-scoped client (RLS still applies on top).
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname <> 'profiles' -- keeps existing column-level UPDATE grants intact
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.%I FROM authenticated', t.relname);
  END LOOP;
END $$;
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES ON public.profiles FROM authenticated;

GRANT INSERT, UPDATE, DELETE ON public.availability TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.calendar_day_notes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_calendars TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT INSERT, UPDATE ON public.billing_details TO authenticated;
GRANT INSERT, UPDATE ON public.freelancer_profiles TO authenticated;
GRANT INSERT, UPDATE ON public.freelancer_contacts TO authenticated;
GRANT INSERT, UPDATE ON public.team_profiles TO authenticated;
GRANT UPDATE ON public.engagements TO authenticated;
GRANT INSERT ON public.ratings TO authenticated;
GRANT INSERT, UPDATE ON public.notifications TO authenticated;
GRANT INSERT ON public.client_error_log TO authenticated;

-- 3) Blocked / deleted accounts must not keep reading data through the Data API.
ALTER POLICY "Availability read scoped" ON public.availability
  USING ((is_test = env_is_test()) AND NOT public.user_is_blocked(auth.uid()) AND ((auth.uid() = freelancer_id) OR (EXISTS (
      SELECT 1 FROM engagements e WHERE e.freelancer_id = availability.freelancer_id AND e.team_id = auth.uid())) OR (EXISTS (
      SELECT 1 FROM matches m WHERE m.freelancer_id = availability.freelancer_id AND m.team_id = auth.uid() AND m.revealed_by_team = true))));

ALTER POLICY "Billing read own" ON public.billing_details
  USING (user_id = auth.uid() AND NOT public.user_is_blocked(auth.uid()));

ALTER POLICY "own notes read" ON public.calendar_day_notes
  USING (auth.uid() = freelancer_id AND is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()));

ALTER POLICY "Engagement visible to parties" ON public.engagements
  USING (((auth.uid() = freelancer_id) OR (auth.uid() = team_id)) AND is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()));

ALTER POLICY "own contacts select" ON public.freelancer_contacts
  USING (auth.uid() = user_id AND NOT public.user_is_blocked(auth.uid()));

ALTER POLICY "Freelancers can view own profile" ON public.freelancer_profiles
  USING (auth.uid() = user_id AND NOT public.user_is_blocked(auth.uid()));

ALTER POLICY "legal_acceptances_select_own" ON public.legal_acceptances
  USING (user_id = auth.uid() AND is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()));

ALTER POLICY "Match visible to parties" ON public.matches
  USING (is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()) AND (((auth.uid() = team_id) AND team_can_see_match(team_id, request_id, freelancer_id)) OR ((auth.uid() = freelancer_id) AND freelancer_match_actionable(auth.uid(), request_id))));

ALTER POLICY "Own notifications" ON public.notifications
  USING (auth.uid() = user_id AND is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()));

ALTER POLICY "Users read own profile" ON public.profiles
  USING (auth.uid() = id AND NOT public.user_is_blocked(auth.uid()));

ALTER POLICY "Users read own push subscriptions" ON public.push_subscriptions
  USING (auth.uid() = user_id AND is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()));

ALTER POLICY "ratings_read_parties_only" ON public.ratings
  USING (is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()) AND ((from_user_id = auth.uid()) OR ((to_user_id = auth.uid()) AND (unlocked_at IS NOT NULL))));

ALTER POLICY "Requests viewable by authenticated" ON public.requests
  USING (is_active = true AND is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()));

ALTER POLICY "Team reads own requests" ON public.requests
  USING (auth.uid() = team_id AND NOT public.user_is_blocked(auth.uid()));

ALTER POLICY "Team sees own pool" ON public.team_pool
  USING (((auth.uid() = team_id) OR (auth.uid() = freelancer_id)) AND is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()));

ALTER POLICY "Team profiles viewable when authorised" ON public.team_profiles
  USING (is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()) AND can_view_team_identity(user_id));

ALTER POLICY "team reads own orders" ON public.token_orders
  USING (team_id = auth.uid() AND NOT public.user_is_blocked(auth.uid()));

ALTER POLICY "Users see own token history" ON public.token_transactions
  USING (auth.uid() = user_id AND is_test = env_is_test() AND NOT public.user_is_blocked(auth.uid()));

ALTER POLICY "Owners read their calendars" ON public.user_calendars
  USING (auth.uid() = owner_id AND NOT public.user_is_blocked(auth.uid()));