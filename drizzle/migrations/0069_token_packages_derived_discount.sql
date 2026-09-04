-- STEP S2.E — Derived package discount / economic model simplification.
-- discount_pct is no longer an economic authority: it is derived from
-- (nominal token price, token_quantity, price_cents). No purchase flow, no tax logic.

-- 1. The economic consistency law disappears: price_cents is now free commercial input.
DROP TRIGGER IF EXISTS token_packages_economic_consistency ON public.token_packages;
DROP FUNCTION IF EXISTS public.tg_token_packages_economic_consistency();
DROP FUNCTION IF EXISTS public.token_package_expected_price_cents(integer, numeric);

-- 2. discount_pct becomes a database-maintained cached derivation, never client input.
CREATE OR REPLACE FUNCTION public.token_package_derived_discount_pct(
  _token_quantity integer,
  _price_cents integer
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _token_quantity IS NULL OR _token_quantity <= 0 THEN 0::numeric
    WHEN ROUND(public.get_setting_num('token_price_eur', 2) * 100)::numeric * _token_quantity <= 0 THEN 0::numeric
    ELSE GREATEST(0::numeric, LEAST(100::numeric, ROUND(
      ( (ROUND(public.get_setting_num('token_price_eur', 2) * 100)::numeric * _token_quantity - _price_cents)
        / (ROUND(public.get_setting_num('token_price_eur', 2) * 100)::numeric * _token_quantity) ) * 100::numeric
    , 2)))
  END;
$$;

CREATE OR REPLACE FUNCTION public.tg_token_packages_derived_discount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Whatever the caller sends is discarded: the column mirrors the derivation only.
  NEW.discount_pct := public.token_package_derived_discount_pct(NEW.token_quantity, NEW.price_cents);
  RETURN NEW;
END;
$$;

CREATE TRIGGER token_packages_derived_discount
BEFORE INSERT OR UPDATE ON public.token_packages
FOR EACH ROW EXECUTE FUNCTION public.tg_token_packages_derived_discount();

-- 3. Row-level optimistic locking (S2.D F-1): ANY persisted admin change needs a version bump.
CREATE OR REPLACE FUNCTION public.tg_token_packages_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_changed boolean;
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'token_packages.code is immutable';
  END IF;

  row_changed :=
    NEW.token_quantity IS DISTINCT FROM OLD.token_quantity
    OR NEW.price_cents IS DISTINCT FROM OLD.price_cents
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.label_key IS DISTINCT FROM OLD.label_key
    OR NEW.sort_order IS DISTINCT FROM OLD.sort_order;

  IF row_changed AND NEW.version <= OLD.version THEN
    RAISE EXCEPTION 'token_packages update requires a version increment (expected > %)', OLD.version;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 4. Backfill the cached derivation for existing rows (additive, no commercial price change).
UPDATE public.token_packages
SET discount_pct = public.token_package_derived_discount_pct(token_quantity, price_cents),
    version = version + 1
WHERE discount_pct IS DISTINCT FROM public.token_package_derived_discount_pct(token_quantity, price_cents);
