REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM anon;

GRANT UPDATE (display_name, avatar_url, preferred_language, first_name, last_name, terms_accepted_at, privacy_accepted_at, legal_version, updated_at) ON public.profiles TO authenticated;