ALTER TABLE public.freelancer_profiles
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS location_region text,
  ADD COLUMN IF NOT EXISTS location_country text,
  ADD COLUMN IF NOT EXISTS location_place_id text;

ALTER TABLE public.team_profiles
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS location_region text,
  ADD COLUMN IF NOT EXISTS location_country text,
  ADD COLUMN IF NOT EXISTS location_place_id text;

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS location_city text,
  ADD COLUMN IF NOT EXISTS location_region text,
  ADD COLUMN IF NOT EXISTS location_country text,
  ADD COLUMN IF NOT EXISTS location_place_id text;

COMMENT ON COLUMN public.freelancer_profiles.location_place_id IS 'Canonical Google Maps Place ID selected through the structural location autocomplete.';
COMMENT ON COLUMN public.team_profiles.location_place_id IS 'Canonical Google Maps Place ID selected through the structural location autocomplete.';
COMMENT ON COLUMN public.requests.location_place_id IS 'Canonical Google Maps Place ID selected through the structural location autocomplete.';