DROP POLICY "Admins read own env state" ON public.admin_env_state;
CREATE POLICY "Admins read own env state" ON public.admin_env_state
FOR SELECT TO authenticated
USING (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));