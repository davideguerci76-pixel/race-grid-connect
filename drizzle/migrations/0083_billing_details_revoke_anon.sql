-- billing_details is strictly private to the owning account: no anonymous access.
REVOKE ALL ON public.billing_details FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.billing_details TO authenticated;
GRANT ALL ON public.billing_details TO service_role;