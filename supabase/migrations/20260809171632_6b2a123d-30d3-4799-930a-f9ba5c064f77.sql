ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

ALTER TABLE public.team_profiles
  ADD COLUMN IF NOT EXISTS vat_number text;

CREATE INDEX IF NOT EXISTS profiles_name_pair_idx
  ON public.profiles (lower(first_name), lower(last_name));

ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'admin_alert';