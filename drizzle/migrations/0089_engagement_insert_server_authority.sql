-- MT05-C1: direct client INSERT into public.engagements is forbidden.
-- Legitimate creation stays server-authoritative via SECURITY DEFINER routines
-- (request_match_confirmation, accept_sos_call, add_pool_member_by_code) and
-- admin/system writers using the service role.

DROP POLICY IF EXISTS "Engagement inserted by parties" ON public.engagements;
DROP POLICY IF EXISTS "Proposer can delete proposed engagement" ON public.engagements;

REVOKE INSERT, DELETE ON public.engagements FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.engagements TO authenticated;
GRANT ALL ON public.engagements TO service_role;

-- Defense in depth: even if a grant/policy is ever re-added by mistake, a
-- non-privileged role cannot create an engagement row directly.
CREATE OR REPLACE FUNCTION public.tg_engagement_insert_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) IN ('anon', 'authenticated')
     OR current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Engagements can only be created through the PITCALL confirmation flow';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_engagement_insert_authority ON public.engagements;
CREATE TRIGGER a_engagement_insert_authority
  BEFORE INSERT ON public.engagements
  FOR EACH ROW EXECUTE FUNCTION public.tg_engagement_insert_authority();