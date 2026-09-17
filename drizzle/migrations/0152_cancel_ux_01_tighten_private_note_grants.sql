-- CANCEL-UX-01 — default privileges granted more than intended on the new table.
-- Keep only owner-scoped SELECT/DELETE for authenticated; writes go through the
-- SECURITY DEFINER cancellation RPC. anon must have nothing at all.
REVOKE ALL ON public.engagement_private_notes FROM anon;
REVOKE ALL ON public.engagement_private_notes FROM authenticated;
GRANT SELECT, DELETE ON public.engagement_private_notes TO authenticated;
GRANT ALL ON public.engagement_private_notes TO service_role;