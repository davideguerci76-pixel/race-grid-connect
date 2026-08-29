-- Environment-scoped recompute wrapper: never touches the other environment.
CREATE OR REPLACE FUNCTION public.recompute_matches_env(_is_test boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _total int := 0; _r record; _n int;
BEGIN
  FOR _r IN
    SELECT id FROM public.requests WHERE is_active = true AND is_test = _is_test
  LOOP
    _n := public.recompute_matches(NULL, _r.id);
    _total := _total + COALESCE(_n, 0);
  END LOOP;
  RETURN _total;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recompute_matches_env(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_matches_env(boolean) TO service_role;

-- TEST / LIVE isolation on the tables that were still environment-agnostic.
DROP POLICY IF EXISTS "Own notifications" ON public.notifications;
CREATE POLICY "Own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id AND is_test = public.env_is_test());

DROP POLICY IF EXISTS "Mark own notifications read" ON public.notifications;
CREATE POLICY "Mark own notifications read" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id AND is_test = public.env_is_test())
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ratings_read_parties_only" ON public.ratings;
CREATE POLICY "ratings_read_parties_only" ON public.ratings
  FOR SELECT USING (
    is_test = public.env_is_test()
    AND (from_user_id = auth.uid() OR (to_user_id = auth.uid() AND unlocked_at IS NOT NULL))
  );

DROP POLICY IF EXISTS "Users see own token history" ON public.token_transactions;
CREATE POLICY "Users see own token history" ON public.token_transactions
  FOR SELECT USING (auth.uid() = user_id AND is_test = public.env_is_test());

DROP POLICY IF EXISTS "Users can view their own match history" ON public.match_history;
CREATE POLICY "Users can view their own match history" ON public.match_history
  FOR SELECT USING (
    is_test = public.env_is_test()
    AND (auth.uid() = freelancer_id OR auth.uid() = team_id)
  );

DROP POLICY IF EXISTS "Freelancer manages own availability" ON public.availability;
CREATE POLICY "Freelancer manages own availability" ON public.availability
  FOR ALL USING (auth.uid() = freelancer_id AND is_test = public.env_is_test())
  WITH CHECK (auth.uid() = freelancer_id AND is_test = public.env_is_test());