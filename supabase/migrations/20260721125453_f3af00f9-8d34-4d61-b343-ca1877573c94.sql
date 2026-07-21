CREATE POLICY "No direct admin email reads" ON public.admin_emails
  FOR SELECT TO authenticated
  USING (false);