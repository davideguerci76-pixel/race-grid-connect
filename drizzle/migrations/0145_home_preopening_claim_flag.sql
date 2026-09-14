INSERT INTO public.platform_settings (key, value_num, category, label, description, unit, sort_order)
VALUES (
  'flag_home_preopening_claim',
  1,
  'flags',
  'Claim pre-opening',
  'When on, the public home page shows the pre-opening information section below the hero.',
  'bool',
  4
)
ON CONFLICT (key) DO NOTHING;