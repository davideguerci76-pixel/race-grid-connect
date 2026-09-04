-- STEP S2.B — Token package authority (no purchase flow, no tax logic)

CREATE TABLE public.token_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label_key text NOT NULL,
  token_quantity integer NOT NULL,
  discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  price_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT token_packages_code_format CHECK (code ~ '^[a-z0-9_]{3,40}$'),
  CONSTRAINT token_packages_quantity_positive CHECK (token_quantity > 0),
  CONSTRAINT token_packages_price_positive CHECK (price_cents > 0),
  CONSTRAINT token_packages_discount_range CHECK (discount_pct >= 0 AND discount_pct <= 100),
  CONSTRAINT token_packages_currency_eur CHECK (currency = 'EUR'),
  CONSTRAINT token_packages_version_positive CHECK (version >= 1)
);

CREATE INDEX token_packages_active_sort_idx ON public.token_packages (is_active, sort_order);

GRANT SELECT ON public.token_packages TO authenticated;
GRANT ALL ON public.token_packages TO service_role;

ALTER TABLE public.token_packages ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read ACTIVE packages only. No INSERT/UPDATE/DELETE policy exists:
-- all writes are server-authoritative (service_role) behind an admin check.
CREATE POLICY "authenticated can read active token packages"
ON public.token_packages
FOR SELECT
TO authenticated
USING (is_active = true);

-- No application DELETE, ever (deactivate via is_active=false).
CREATE OR REPLACE FUNCTION public.tg_token_packages_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'token_packages rows cannot be deleted; set is_active=false instead';
END;
$$;

CREATE TRIGGER token_packages_no_delete
BEFORE DELETE ON public.token_packages
FOR EACH ROW EXECUTE FUNCTION public.tg_token_packages_no_delete();

-- Economic changes must carry an explicit version bump (optimistic locking guard),
-- code is immutable, updated_at maintained by the database.
CREATE OR REPLACE FUNCTION public.tg_token_packages_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  economic_changed boolean;
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'token_packages.code is immutable';
  END IF;

  economic_changed :=
    NEW.token_quantity IS DISTINCT FROM OLD.token_quantity
    OR NEW.price_cents IS DISTINCT FROM OLD.price_cents
    OR NEW.discount_pct IS DISTINCT FROM OLD.discount_pct
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.is_active IS DISTINCT FROM OLD.is_active;

  IF economic_changed AND NEW.version <= OLD.version THEN
    RAISE EXCEPTION 'token_packages economic update requires a version increment (expected > %)', OLD.version;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER token_packages_guard
BEFORE UPDATE ON public.token_packages
FOR EACH ROW EXECUTE FUNCTION public.tg_token_packages_guard();

-- Baseline authoritative seed. price_cents = TAX-EXCLUSIVE base commercial price.
INSERT INTO public.token_packages (code, label_key, token_quantity, discount_pct, price_cents, currency, is_active, sort_order)
VALUES
  ('tokens_10',  'tokens.packages.tokens_10',  10,  0,   2000, 'EUR', true, 10),
  ('tokens_50',  'tokens.packages.tokens_50',  50,  5,   9500, 'EUR', true, 20),
  ('tokens_200', 'tokens.packages.tokens_200', 200, 10, 36000, 'EUR', true, 30);
