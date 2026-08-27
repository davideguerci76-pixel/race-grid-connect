DROP POLICY IF EXISTS settings_read_public_categories_authed ON public.platform_settings;
CREATE POLICY settings_read_public_categories_authed ON public.platform_settings
FOR SELECT TO authenticated
USING (category = ANY (ARRAY['flags','costs','reveal_costs','rewards','economics','refunds','calendar']));