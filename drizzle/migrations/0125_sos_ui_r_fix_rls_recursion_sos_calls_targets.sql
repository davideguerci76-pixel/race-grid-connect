-- SOS-UI.R: the two SELECT policies on sos_calls / sos_call_targets referenced each other,
-- producing "infinite recursion detected in policy" for every authenticated read.
-- Break the cycle with SECURITY DEFINER helpers (same semantics, no policy re-entry).

CREATE OR REPLACE FUNCTION public.sos_is_target(_sos_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sos_call_targets t
    WHERE t.sos_id = _sos_id AND t.freelancer_id = _uid
  );
$$;

CREATE OR REPLACE FUNCTION public.sos_team_owner(_sos_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sos_calls s
    WHERE s.id = _sos_id AND s.team_id = _uid
  );
$$;

REVOKE ALL ON FUNCTION public.sos_is_target(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sos_team_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sos_is_target(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sos_team_owner(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS sos_calls_read ON public.sos_calls;
CREATE POLICY sos_calls_read ON public.sos_calls
  FOR SELECT TO authenticated
  USING (team_id = auth.uid() OR public.sos_is_target(id, auth.uid()));

DROP POLICY IF EXISTS sos_targets_read ON public.sos_call_targets;
CREATE POLICY sos_targets_read ON public.sos_call_targets
  FOR SELECT TO authenticated
  USING (freelancer_id = auth.uid() OR public.sos_team_owner(sos_id, auth.uid()));