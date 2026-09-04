-- STEP S2.C — Economic consistency law for token packages (no tax logic, no purchase flow)
-- price_cents MUST equal ROUND(token_quantity * nominal_token_price_cents * (100 - discount_pct) / 100)
-- All arithmetic in integer cents; nominal reference = platform_settings.token_price_eur (display/nominal only).

CREATE OR REPLACE FUNCTION public.token_package_expected_price_cents(
  _token_quantity integer,
  _discount_pct numeric
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    ROUND(
      (ROUND(public.get_setting_num('token_price_eur', 2) * 100)::numeric
        * _token_quantity::numeric
        * (100::numeric - _discount_pct)
      ) / 100::numeric
    )
  )::integer;
$$;

CREATE OR REPLACE FUNCTION public.tg_token_packages_economic_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected integer;
BEGIN
  expected := public.token_package_expected_price_cents(NEW.token_quantity, NEW.discount_pct);
  IF NEW.price_cents <> expected THEN
    RAISE EXCEPTION 'economic_incoherence: price_cents % does not match expected % for % tokens at %%% discount',
      NEW.price_cents, expected, NEW.token_quantity, NEW.discount_pct;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER token_packages_economic_consistency
BEFORE INSERT OR UPDATE ON public.token_packages
FOR EACH ROW EXECUTE FUNCTION public.tg_token_packages_economic_consistency();
