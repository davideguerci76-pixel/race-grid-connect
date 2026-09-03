INSERT INTO public.platform_settings (key, value_num, category, label, description, unit, sort_order)
VALUES (
  'professional_relevance_threshold',
  50,
  'matching',
  'Professional Relevance Threshold',
  'Minimum professional score PITCALL uses to consider a Match relevant for selected proactive and commercial rules. This does not affect Match visibility.',
  '%',
  310
)
ON CONFLICT (key) DO NOTHING;