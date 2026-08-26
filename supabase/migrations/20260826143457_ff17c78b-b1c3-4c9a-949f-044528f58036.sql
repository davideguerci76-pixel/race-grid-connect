DROP POLICY IF EXISTS "settings_read_all_authed" ON public.platform_settings;
CREATE POLICY "settings_read_public_categories_authed" ON public.platform_settings
  FOR SELECT TO authenticated
  USING (category IN ('flags','costs','reveal_costs','rewards','economics','refunds'));
CREATE POLICY "settings_read_admin" ON public.platform_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "time_settings_read" ON public.admin_time_settings;
CREATE POLICY "time_settings_read_admin" ON public.admin_time_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));