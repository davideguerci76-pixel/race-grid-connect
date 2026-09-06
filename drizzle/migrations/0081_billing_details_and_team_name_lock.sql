-- 1) Billing details: private administrative registry, one row per account.
CREATE TABLE IF NOT EXISTS public.billing_details (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_type text NOT NULL DEFAULT 'individual' CHECK (subject_type IN ('individual','company')),
  billing_name text,
  country text,
  address text,
  city text,
  postal_code text,
  region text,
  tax_id text,
  sdi_code text,
  pec text,
  billing_email text,
  billing_phone text,
  is_test boolean NOT NULL DEFAULT public.env_is_test(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.billing_details TO authenticated;
GRANT ALL ON public.billing_details TO service_role;

ALTER TABLE public.billing_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Billing read own" ON public.billing_details;
CREATE POLICY "Billing read own" ON public.billing_details
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Billing insert own" ON public.billing_details;
CREATE POLICY "Billing insert own" ON public.billing_details
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Billing update own" ON public.billing_details;
CREATE POLICY "Billing update own" ON public.billing_details
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- environment tag always mirrors the owning profile
CREATE OR REPLACE FUNCTION public.tg_billing_details_env()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  SELECT p.is_test INTO NEW.is_test FROM public.profiles p WHERE p.id = NEW.user_id;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_billing_details_env ON public.billing_details;
CREATE TRIGGER tg_billing_details_env
  BEFORE INSERT OR UPDATE ON public.billing_details
  FOR EACH ROW EXECUTE FUNCTION public.tg_billing_details_env();

-- 2) Team name authority: only Admin/PITCALL (service role) may change it.
CREATE OR REPLACE FUNCTION public.tg_lock_team_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'team_profiles' AND NEW.team_name IS DISTINCT FROM OLD.team_name THEN
    RAISE EXCEPTION 'TEAM_NAME_LOCKED';
  END IF;
  IF TG_TABLE_NAME = 'profiles' AND OLD.user_type = 'team' AND NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    RAISE EXCEPTION 'TEAM_NAME_LOCKED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_lock_team_name ON public.team_profiles;
CREATE TRIGGER tg_lock_team_name
  BEFORE UPDATE ON public.team_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_lock_team_identity();

DROP TRIGGER IF EXISTS tg_lock_team_display_name ON public.profiles;
CREATE TRIGGER tg_lock_team_display_name
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_lock_team_identity();

-- 3) Billing snapshot readiness on economic records (no fiscal semantics added).
ALTER TABLE public.token_orders ADD COLUMN IF NOT EXISTS billing_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.tg_token_orders_billing_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _b public.billing_details%ROWTYPE;
BEGIN
  IF NEW.billing_snapshot IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO _b FROM public.billing_details WHERE user_id = NEW.team_id;
  IF FOUND THEN
    NEW.billing_snapshot := jsonb_build_object(
      'captured_at', now(),
      'subject_type', _b.subject_type,
      'billing_name', _b.billing_name,
      'country', _b.country,
      'address', _b.address,
      'city', _b.city,
      'postal_code', _b.postal_code,
      'region', _b.region,
      'tax_id', _b.tax_id,
      'sdi_code', _b.sdi_code,
      'pec', _b.pec,
      'billing_email', _b.billing_email,
      'billing_phone', _b.billing_phone
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_token_orders_billing_snapshot ON public.token_orders;
CREATE TRIGGER tg_token_orders_billing_snapshot
  BEFORE INSERT ON public.token_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_token_orders_billing_snapshot();