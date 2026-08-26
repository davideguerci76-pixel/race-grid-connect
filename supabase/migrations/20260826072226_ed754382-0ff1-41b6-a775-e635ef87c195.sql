INSERT INTO public.platform_settings (key, value_num, category, label, description, unit, sort_order) VALUES
  ('flag_coming_soon', 0, 'flags', 'Coming Soon landing mode', 'When on, the public home page shows a coming-soon landing instead of the standard home.', 'bool', 1),
  ('flag_home_stats', 1, 'flags', 'Show stats on home page', 'When off, market highlights and counters are hidden from the home page.', 'bool', 2),
  ('flag_pitcall_creation_disabled', 0, 'flags', 'Disable Pit Call creation', 'When on, teams cannot create new Pit Calls. Registration and calendars stay active.', 'bool', 3)
ON CONFLICT (key) DO NOTHING;

CREATE POLICY "settings_read_flags_anon" ON public.platform_settings
  FOR SELECT TO anon USING (category = 'flags');

GRANT SELECT ON public.platform_settings TO anon;