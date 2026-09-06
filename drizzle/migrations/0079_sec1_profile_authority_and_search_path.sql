-- 1. Legal acceptance columns are written only by public.record_legal_acceptance (SECURITY DEFINER).
--    Remove the unused direct UPDATE grant so users cannot forge their legal audit trail.
REVOKE UPDATE (terms_accepted_at, privacy_accepted_at, legal_version) ON public.profiles FROM authenticated;

-- 2. Defense in depth: block any non-privileged update of server-authoritative profile fields,
--    even if a column grant is ever re-added by mistake.
CREATE OR REPLACE FUNCTION public.tg_profiles_authority_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.token_balance IS DISTINCT FROM OLD.token_balance
     OR NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
     OR NEW.is_test IS DISTINCT FROM OLD.is_test
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.terms_accepted_at IS DISTINCT FROM OLD.terms_accepted_at
     OR NEW.privacy_accepted_at IS DISTINCT FROM OLD.privacy_accepted_at
     OR NEW.legal_version IS DISTINCT FROM OLD.legal_version THEN
    RAISE EXCEPTION 'Forbidden: server-authoritative profile field';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_authority_guard ON public.profiles;
CREATE TRIGGER profiles_authority_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_authority_guard();

-- 3. Mutable search_path finding.
ALTER FUNCTION public.taxonomy_normalize_code(text) SET search_path = public, pg_temp;
