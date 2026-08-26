ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_version text;

COMMENT ON COLUMN public.profiles.terms_accepted_at IS 'GDPR proof of acceptance of Terms of Service at signup.';
COMMENT ON COLUMN public.profiles.privacy_accepted_at IS 'GDPR proof of acknowledgement of the Privacy Policy at signup.';