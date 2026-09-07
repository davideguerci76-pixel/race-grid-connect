-- REM-W3 — Stripe failure lifecycle / terminal webhook rejection / abandoned
-- order expiry / server-authoritative provider mode.

ALTER TABLE public.token_orders
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

ALTER TABLE public.token_order_events
  ADD COLUMN IF NOT EXISTS is_test boolean,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS provider_payment_id text;

CREATE INDEX IF NOT EXISTS token_orders_expiry_idx
  ON public.token_orders (status, expires_at)
  WHERE status IN ('created', 'payment_pending');

INSERT INTO public.platform_settings (key, value_num, category, label, description, unit, sort_order)
VALUES
  ('token_order_expiry_minutes', 60, 'flags', 'Token order expiry (minutes)',
   'How long an unpaid token order stays payable before it is expired as abandoned.', 'min', 93),
  ('token_open_orders_max', 5, 'flags', 'Max open token orders per team',
   'Maximum simultaneous unpaid token orders a single team may hold.', 'count', 94)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tg_token_orders_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.team_id <> OLD.team_id
      OR NEW.created_by <> OLD.created_by
      OR NEW.is_test <> OLD.is_test
      OR NEW.package_id <> OLD.package_id
      OR NEW.package_code <> OLD.package_code
      OR NEW.package_version <> OLD.package_version
      OR NEW.token_quantity <> OLD.token_quantity
      OR NEW.nominal_token_price_cents <> OLD.nominal_token_price_cents
      OR NEW.discount_pct <> OLD.discount_pct
      OR NEW.base_amount_cents <> OLD.base_amount_cents
      OR NEW.currency <> OLD.currency
      OR NEW.provider_mode <> OLD.provider_mode
    THEN
      RAISE EXCEPTION 'token order snapshot is immutable';
    END IF;

    IF OLD.status = 'credited' AND NEW.status <> 'credited' THEN
      RAISE EXCEPTION 'credited orders are terminal';
    END IF;
    IF OLD.status = 'failed' AND NEW.status <> 'failed' THEN
      RAISE EXCEPTION 'terminal order status cannot change';
    END IF;

    IF NEW.status <> OLD.status AND NOT (
         (OLD.status = 'created'         AND NEW.status IN ('payment_pending','failed','cancelled','expired'))
      OR (OLD.status = 'payment_pending' AND NEW.status IN ('paid','failed','cancelled','expired'))
      OR (OLD.status = 'paid'            AND NEW.status IN ('credited','failed'))
      OR (OLD.status = 'expired'         AND NEW.status IN ('paid','failed'))
      OR (OLD.status = 'cancelled'       AND NEW.status IN ('paid','failed'))
    ) THEN
      RAISE EXCEPTION 'illegal order transition % -> %', OLD.status, NEW.status;
    END IF;

    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.token_provider_mode(_is_test boolean)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(_is_test, true) THEN 'test'
    WHEN public.get_setting_num('flag_token_payments_live_enabled', 0) >= 1 THEN 'live'
    ELSE 'test'
  END;
$$;

REVOKE ALL ON FUNCTION public.token_provider_mode(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.token_provider_mode(boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.expire_abandoned_token_orders(_is_test boolean DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.token_orders
       SET status = 'expired', expired_at = now()
     WHERE status IN ('created', 'payment_pending')
       AND expires_at IS NOT NULL
       AND expires_at < now()
       AND (_is_test IS NULL OR is_test = _is_test)
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_count FROM expired;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_abandoned_token_orders(boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_abandoned_token_orders(boolean) TO service_role;

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
  v_mode text;
  v_ttl integer;
  v_open integer;
  v_max integer;
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

  UPDATE public.token_orders
     SET status = 'expired', expired_at = now()
   WHERE team_id = v_uid
     AND status IN ('created', 'payment_pending')
     AND expires_at IS NOT NULL
     AND expires_at < now();

  v_max := GREATEST(1, ROUND(public.get_setting_num('token_open_orders_max', 5))::integer);
  SELECT count(*) INTO v_open
    FROM public.token_orders
   WHERE team_id = v_uid AND status IN ('created', 'payment_pending');
  IF v_open >= v_max THEN
    RAISE EXCEPTION 'too_many_open_orders';
  END IF;

  v_nominal_cents := ROUND(public.get_setting_num('token_price_eur', 2) * 100)::integer;
  v_discount := public.token_package_derived_discount_pct(v_pkg.token_quantity, v_pkg.price_cents);
  v_mode := public.token_provider_mode(v_is_test);
  v_ttl := GREATEST(5, ROUND(public.get_setting_num('token_order_expiry_minutes', 60))::integer);

  INSERT INTO public.token_orders (
    team_id, created_by, is_test, package_id, package_code, package_label_key, package_version,
    token_quantity, nominal_token_price_cents, discount_pct, base_amount_cents, currency,
    provider, provider_mode, status, expires_at
  ) VALUES (
    v_uid, v_uid, v_is_test, v_pkg.id, v_pkg.code, v_pkg.label_key, v_pkg.version,
    v_pkg.token_quantity, v_nominal_cents, v_discount, v_pkg.price_cents, v_pkg.currency,
    'none', v_mode, 'created', now() + make_interval(mins => v_ttl)
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
  v_reason text;
  v_found boolean := false;
  v_expected_mode text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('token_order_credit:' || _order_id::text));

  SELECT * INTO v_order FROM public.token_orders WHERE id = _order_id FOR UPDATE;
  v_found := FOUND;

  BEGIN
    INSERT INTO public.token_order_events (
      order_id, provider, provider_mode, provider_event_id, event_type, payload,
      is_test, provider_payment_id, outcome
    )
    VALUES (
      CASE WHEN v_found THEN _order_id ELSE NULL END,
      _provider, _provider_mode, _provider_event_id, _event_type,
      COALESCE(_payload, '{}'::jsonb),
      CASE WHEN v_found THEN v_order.is_test ELSE NULL END,
      _provider_payment_id, 'received'
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'replay', true, 'order_id', _order_id);
  END;

  IF NOT v_found THEN
    v_reason := 'order_not_found';
  ELSIF v_order.status = 'credited' THEN
    UPDATE public.token_order_events SET processed_at = now(), outcome = 'already_credited'
     WHERE provider = _provider AND provider_event_id = _provider_event_id;
    RETURN jsonb_build_object('ok', true, 'already_credited', true, 'order_id', _order_id);
  ELSE
    v_expected_mode := public.token_provider_mode(v_order.is_test);
    IF _provider_mode <> v_order.provider_mode OR _provider_mode <> v_expected_mode THEN
      v_reason := 'provider_mode_mismatch';
    ELSIF _provider_mode = 'live' AND public.get_setting_num('flag_token_payments_live_enabled', 0) < 1 THEN
      v_reason := 'live_payments_disabled';
    ELSIF NOT public.token_purchase_allowed(v_order.is_test) THEN
      v_reason := 'token_purchase_disabled';
    ELSIF v_order.status = 'failed' THEN
      v_reason := 'order_not_payable';
    ELSE
      v_expected := v_order.base_amount_cents + COALESCE(_tax_amount_cents, 0);
      IF _amount_collected_cents IS DISTINCT FROM v_expected THEN
        v_reason := 'amount_mismatch';
      ELSIF EXISTS (
        SELECT 1 FROM public.token_orders o
         WHERE o.provider = _provider
           AND o.provider_payment_id = _provider_payment_id
           AND o.id <> _order_id
      ) THEN
        v_reason := 'payment_already_used';
      END IF;
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE public.token_order_events
       SET processed_at = now(), outcome = 'terminal_rejected', rejection_reason = v_reason
     WHERE provider = _provider AND provider_event_id = _provider_event_id;

    IF v_found AND v_order.status <> 'credited' AND v_order.status <> 'failed' THEN
      UPDATE public.token_orders
         SET status = 'failed',
             failed_at = now(),
             rejected_at = now(),
             rejection_reason = v_reason
       WHERE id = _order_id;
    END IF;

    RETURN jsonb_build_object('ok', false, 'terminal', true, 'reason', v_reason, 'order_id', _order_id);
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
   WHERE id = _order_id AND status IN ('payment_pending', 'expired', 'cancelled');

  PERFORM public.credit_tokens(v_order.team_id, v_order.token_quantity, 'purchase'::token_reason, _order_id,
                               'token order ' || _order_id::text);

  SELECT id INTO v_tx_id
    FROM public.token_transactions
   WHERE user_id = v_order.team_id AND ref_id = _order_id AND reason = 'purchase'
   ORDER BY created_at DESC LIMIT 1;

  UPDATE public.token_orders
     SET status = 'credited', credited_at = now(), credit_transaction_id = v_tx_id
   WHERE id = _order_id;

  UPDATE public.token_order_events SET processed_at = now(), outcome = 'credited'
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
         expires_at = GREATEST(
           COALESCE(expires_at, now()),
           now() + make_interval(mins => GREATEST(5, ROUND(public.get_setting_num('token_order_expiry_minutes', 60))::integer))
         ),
         status = CASE WHEN status = 'created' THEN 'payment_pending' ELSE status END
   WHERE id = _order_id
     AND status IN ('created', 'payment_pending');
END;
$$;

REVOKE ALL ON FUNCTION public.attach_token_order_session(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_token_order_session(uuid, text, text) TO service_role;

UPDATE public.token_orders
   SET expires_at = created_at + interval '60 minutes'
 WHERE expires_at IS NULL
   AND status IN ('created', 'payment_pending');
