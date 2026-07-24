ALTER TABLE public.freelancer_profiles
  ADD COLUMN IF NOT EXISTS phone_dial_code TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT;