-- STEP S2.E.1 — Changing the nominal token price rescales package commercial prices
-- so each package keeps EXACTLY its previous discount ratio. Single atomic function.
CREATE OR REPLACE FUNCTION public.admin_set_token_price_eur(_new_price numeric, _admin uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_cents integer;
  new_cents integer;
  updated jsonb;
BEGIN
  IF NOT public.has_role(_admin, 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  IF _new_price IS NULL OR _new_price <= 0 THEN
    RAISE EXCEPTION 'invalid token price';
  END IF;

  -- Serialize concurrent price changes so no interleaved rescale can happen.
  PERFORM pg_advisory_xact_lock(hashtext('token_price_eur_rescale'));

  old_cents := ROUND(public.get_setting_num('token_price_eur', 2) * 100)::integer;
  new_cents := ROUND(_new_price * 100)::integer;

  UPDATE public.platform_settings
  SET value_num = _new_price, updated_at = now(), updated_by = _admin
  WHERE key = 'token_price_eur';

  IF old_cents > 0 AND new_cents <> old_cents THEN
    -- Exact ratio preservation on integer cents: new_price = round(price * new/old).
    WITH up AS (
      UPDATE public.token_packages tp
      SET price_cents = GREATEST(1, ROUND(tp.price_cents::numeric * new_cents::numeric / old_cents::numeric)::integer),
          version = tp.version + 1,
          updated_by = _admin
      WHERE tp.price_cents <> GREATEST(1, ROUND(tp.price_cents::numeric * new_cents::numeric / old_cents::numeric)::integer)
      RETURNING tp.code, tp.token_quantity, tp.price_cents, tp.discount_pct
    )
    SELECT jsonb_agg(to_jsonb(up)) INTO updated FROM up;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'old_token_price_cents', old_cents,
    'new_token_price_cents', new_cents,
    'packages', COALESCE(updated, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_token_price_eur(numeric, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_token_price_eur(numeric, uuid) TO service_role;