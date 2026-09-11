-- SOS-UI.R: the RESTRICTIVE "no direct writes" policies were declared FOR ALL USING (false),
-- which also vetoes every SELECT (restrictive policies are AND-ed). Re-declare them as
-- write-only blocks and make sure the read grant exists. Writes stay impossible from clients:
-- only SECURITY DEFINER authority (trigger_sos_call / accept_sos_call) touches these tables.

DROP POLICY IF EXISTS sos_calls_no_direct_writes ON public.sos_calls;
CREATE POLICY sos_calls_no_direct_insert ON public.sos_calls AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY sos_calls_no_direct_update ON public.sos_calls AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false);
CREATE POLICY sos_calls_no_direct_delete ON public.sos_calls AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

DROP POLICY IF EXISTS sos_call_targets_no_direct_writes ON public.sos_call_targets;
CREATE POLICY sos_call_targets_no_direct_insert ON public.sos_call_targets AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY sos_call_targets_no_direct_update ON public.sos_call_targets AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false);
CREATE POLICY sos_call_targets_no_direct_delete ON public.sos_call_targets AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

GRANT SELECT ON public.sos_calls TO authenticated;
GRANT SELECT ON public.sos_call_targets TO authenticated;
GRANT ALL ON public.sos_calls TO service_role;
GRANT ALL ON public.sos_call_targets TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.sos_calls FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.sos_call_targets FROM authenticated, anon;