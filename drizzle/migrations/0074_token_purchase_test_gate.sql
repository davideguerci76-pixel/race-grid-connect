-- STEP S4 — Environment-scoped purchase gate.
INSERT INTO public.platform_settings (key, value_num, category, label, description, unit, sort_order)
VALUES
  ('flag_token_purchase_test_enabled', 0, 'flags', 'Token purchase enabled (TEST env only)',
   'Authorises the token purchase path for PITCALL TEST sessions only. Never affects LIVE teams.', 'bool', 92)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.token_purchase_allowed(_is_test boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_setting_num('flag_token_purchase_enabled', 0) >= 1
      OR (COALESCE(_is_test, false)
          AND public.get_setting_num('flag_token_purchase_test_enabled', 0) >= 1);
$$;

REVOKE ALL ON FUNCTION public.token_purchase_allowed(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.token_purchase_allowed(boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_token_order(_package_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_test boolean := public.env_is_test();
  v_pkg public.token_packages%ROWTYPE;
  v_nominal_cents integer;
  v_discount numeric(5,2);
  v_order_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF NOT public.token_purchase_allowed(v_is_test) THEN
    RAISE EXCEPTION 'token_purchase_disabled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.user_type = 'team' AND p.blocked_at IS NULL) THEN
    RAISE EXCEPTION 'only active teams can order tokens';
  END IF;

  SELECT * INTO v_pkg FROM public.token_packages WHERE code = _package_code AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'package_not_available';
  END IF;

  v_nominal_cents := ROUND(public.get_setting_num('token_price_eur', 2) * 100)::integer;
  v_discount := public.token_package_derived_discount_pct(v_pkg.token_quantity, v_pkg.price_cents);

  INSERT INTO public.token_orders (
    team_id, created_by, is_test, package_id, package_code, package_label_key, package_version,
    token_quantity, nominal_token_price_cents, discount_pct, base_amount_cents, currency,
    provider, provider_mode, status
  ) VALUES (
    v_uid, v_uid, v_is_test, v_pkg.id, v_pkg.code, v_pkg.label_key, v_pkg.version,
    v_pkg.token_quantity, v_nominal_cents, v_discount, v_pkg.price_cents, v_pkg.currency,
    'none', 'test', 'created'
  )
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_token_order(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_token_order(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_token_order_payment(
  _order_id uuid,
  _provider text,
  _provider_mode text,
  _provider_event_id text,
  _event_type text,
  _provider_payment_id text,
  _amount_collected_cents integer,
  _tax_amount_cents integer DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.token_orders%ROWTYPE;
  v_tx_id uuid;
  v_expected integer;
BEGIN
  IF _provider_mode = 'live' AND public.get_setting_num('flag_token_payments_live_enabled', 0) < 1 THEN
    RAISE EXCEPTION 'live_payments_disabled';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('token_order_credit:' || _order_id::text));

  BEGIN
    INSERT INTO public.token_order_events (order_id, provider, provider_mode, provider_event_id, event_type, payload)
    VALUES (_order_id, _provider, _provider_mode, _provider_event_id, _event_type, COALESCE(_payload, '{}'::jsonb));
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'replay', true, 'order_id', _order_id);
  END;

  SELECT * INTO v_order FROM public.token_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF NOT public.token_purchase_allowed(v_order.is_test) THEN
    RAISE EXCEPTION 'token_purchase_disabled';
  END IF;
  IF v_order.provider_mode <> _provider_mode THEN
    RAISE EXCEPTION 'provider_mode_mismatch';
  END IF;
  IF v_order.status = 'credited' THEN
    RETURN jsonb_build_object('ok', true, 'already_credited', true, 'order_id', _order_id);
  END IF;
  IF v_order.status NOT IN ('created','payment_pending','paid') THEN
    RAISE EXCEPTION 'order_not_payable';
  END IF;

  v_expected := v_order.base_amount_cents + COALESCE(_tax_amount_cents, 0);
  IF _amount_collected_cents IS DISTINCT FROM v_expected THEN
    UPDATE public.token_order_events SET processed_at = now()
     WHERE provider = _provider AND provider_event_id = _provider_event_id;
    RAISE EXCEPTION 'amount_mismatch: expected % got %', v_expected, _amount_collected_cents;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.token_orders o
     WHERE o.provider = _provider AND o.provider_payment_id = _provider_payment_id AND o.id <> _order_id
  ) THEN
    RAISE EXCEPTION 'payment_already_used';
  END IF;

  UPDATE public.token_orders SET status = 'payment_pending'
   WHERE id = _order_id AND status = 'created';

  UPDATE public.token_orders
     SET status = 'paid',
         provider = _provider,
         provider_payment_id = _provider_payment_id,
         amount_collected_cents = _amount_collected_cents,
         tax_amount_cents = _tax_amount_cents,
         total_amount_cents = base_amount_cents + COALESCE(_tax_amount_cents, 0),
         payment_confirmed_at = COALESCE(payment_confirmed_at, now())
   WHERE id = _order_id AND status = 'payment_pending';

  PERFORM public.credit_tokens(v_order.team_id, v_order.token_quantity, 'purchase'::token_reason, _order_id,
                               'token order ' || _order_id::text);

  SELECT id INTO v_tx_id
    FROM public.token_transactions
   WHERE user_id = v_order.team_id AND ref_id = _order_id AND reason = 'purchase'
   ORDER BY created_at DESC LIMIT 1;

  UPDATE public.token_orders
     SET status = 'credited', credited_at = now(), credit_transaction_id = v_tx_id
   WHERE id = _order_id;

  UPDATE public.token_order_events SET processed_at = now()
   WHERE provider = _provider AND provider_event_id = _provider_event_id;

  RETURN jsonb_build_object('ok', true, 'order_id', _order_id, 'credited', true, 'tokens', v_order.token_quantity);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_token_order_payment(uuid, text, text, text, text, text, integer, integer, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_token_order_payment(uuid, text, text, text, text, text, integer, integer, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.attach_token_order_session(
  _order_id uuid, _provider text, _session_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.token_orders
     SET provider = _provider,
         provider_session_id = _session_id,
         status = CASE WHEN status = 'created' THEN 'payment_pending' ELSE status END
   WHERE id = _order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_token_order_session(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_token_order_session(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_token_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  UPDATE public.token_orders
     SET status = 'cancelled', cancelled_at = now()
   WHERE id = _order_id
     AND team_id = auth.uid()
     AND status IN ('created','payment_pending');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_token_order(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_token_order(uuid) TO authenticated, service_role;