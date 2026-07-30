
REVOKE EXECUTE ON FUNCTION public.tg_bump_calendar_freshness() FROM PUBLIC, anon;

CREATE POLICY "match_unlocks_freelancer_select"
ON public.match_unlocks
FOR SELECT
TO authenticated
USING (freelancer_id = auth.uid());

CREATE POLICY "sos_calls_no_direct_writes"
ON public.sos_calls
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "sos_call_targets_no_direct_writes"
ON public.sos_call_targets
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);
