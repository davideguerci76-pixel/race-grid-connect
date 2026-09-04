-- STEP S3 — Token order foundation. Commercial authority stays in PITCALL;
-- payment provider only attests payment lifecycle. No Stripe, no purchase yet.

CREATE TABLE public.token_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_test boolean NOT NULL DEFAULT public.env_is_test(),

  -- immutable commercial snapshot (server-resolved at creation)
  package_id uuid NOT NULL REFERENCES public.token_packages(id),
  package_code text NOT NULL,
  package_label_key text NOT NULL,
  package_version integer NOT NULL,
  token_quantity integer NOT NULL CHECK (token_quantity > 0),
  nominal_token_price_cents integer NOT NULL CHECK (nominal_token_price_cents > 0),
  discount_pct numeric(5,2) NOT NULL CHECK (discount_pct >= 0 AND discount_pct <= 100),
  base_amount_cents integer NOT NULL CHECK (base_amount_cents > 0),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),

  -- tax / total: filled only by a future provider-side calculation
  tax_amount_cents integer CHECK (tax_amount_cents IS NULL OR tax_amount_cents >= 0),
  total_amount_cents integer CHECK (total_amount_cents IS NULL OR total_amount_cents > 0),
  amount_collected_cents integer CHECK (amount_collected_cents IS NULL OR amount_collected_cents >= 0),

  -- provider dimension, deliberately separate from PITCALL is_test
  provider text NOT NULL DEFAULT 'none' CHECK (provider IN ('none','stripe')),
  provider_mode text NOT NULL DEFAULT 'test' CHECK (provider_mode IN ('test','live')),
  provider_session_id text,
  provider_payment_id text,

  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','payment_pending','paid','credited','failed','cancelled','expired')),
  credit_transaction_id uuid REFERENCES public.token_transactions(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  payment_confirmed_at timestamptz,
  credited_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,

  CONSTRAINT token_orders_credited_shape CHECK (
    (status <> 'credited') OR (credited_at IS NOT NULL AND credit_transaction_id IS NOT NULL)
  )
);

CREATE INDEX token_orders_team_idx ON public.token_orders (team_id, created_at DESC);
CREATE INDEX token_orders_status_idx ON public.token_orders (status);
CREATE UNIQUE INDEX token_orders_provider_payment_uniq
  ON public.token_orders (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
-- one order may be credited at most once
CREATE UNIQUE INDEX token_orders_credit_tx_uniq
  ON public.token_orders (credit_transaction_id)
  WHERE credit_transaction_id IS NOT NULL;

GRANT SELECT ON public.token_orders TO authenticated;
GRANT ALL ON public.token_orders TO service_role;

ALTER TABLE public.token_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team reads own orders"
  ON public.token_orders FOR SELECT TO authenticated
  USING (team_id = auth.uid());

CREATE POLICY "admins read all orders"
  ON public.token_orders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- Provider event ledger: replay/idempotency anchor for future webhooks.
-- ---------------------------------------------------------------------------
CREATE TABLE public.token_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.token_orders(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe')),
  provider_mode text NOT NULL CHECK (provider_mode IN ('test','live')),
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

GRANT ALL ON public.token_order_events TO service_role;
ALTER TABLE public.token_order_events ENABLE ROW LEVEL SECURITY;
-- no policies: readable only through service_role / SECURITY DEFINER paths

-- ---------------------------------------------------------------------------
-- Immutability guard: snapshot fields and credited state can never be edited,
-- and the state machine only moves along allowed edges.
-- ---------------------------------------------------------------------------
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
    IF OLD.status IN ('failed','cancelled','expired') AND NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'terminal order status cannot change';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
         (OLD.status = 'created'         AND NEW.status IN ('payment_pending','failed','cancelled','expired'))
      OR (OLD.status = 'payment_pending' AND NEW.status IN ('paid','failed','cancelled','expired'))
      OR (OLD.status = 'paid'            AND NEW.status IN ('credited','failed'))
    ) THEN
      RAISE EXCEPTION 'illegal order transition % -> %', OLD.status, NEW.status;
    END IF;

    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER token_orders_guard
BEFORE UPDATE ON public.token_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_token_orders_guard();

CREATE OR REPLACE FUNCTION public.tg_token_orders_no_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'token orders cannot be deleted';
END;
$$;

CREATE TRIGGER token_orders_no_delete
BEFORE DELETE ON public.token_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_token_orders_no_delete();

-- ---------------------------------------------------------------------------
-- Feature flags (server authority). Purchase and LIVE payments are OFF.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value_num, category, label, description, unit, sort_order)
VALUES
  ('flag_token_purchase_enabled', 0, 'flags', 'Token purchase enabled',
   'Master switch for token order creation. 0 = purchase disabled everywhere.', 'bool', 90),
  ('flag_token_payments_live_enabled', 0, 'flags', 'Token payments LIVE mode enabled',
   'Allows provider LIVE transactions. 0 = only provider TEST mode is ever permitted.', 'bool', 91)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Order creation authority: the client may only name a package code.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_token_order(_package_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pkg public.token_packages%ROWTYPE;
  v_nominal_cents integer;
  v_discount numeric(5,2);
  v_order_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF public.get_setting_num('flag_token_purchase_enabled', 0) < 1 THEN
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
    team_id, created_by, package_id, package_code, package_label_key, package_version,
    token_quantity, nominal_token_price_cents, discount_pct, base_amount_cents, currency,
    provider, provider_mode, status
  ) VALUES (
    v_uid, v_uid, v_pkg.id, v_pkg.code, v_pkg.label_key, v_pkg.version,
    v_pkg.token_quantity, v_nominal_cents, v_discount, v_pkg.price_cents, v_pkg.currency,
    'none', 'test', 'created'
  )
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_token_order(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_token_order(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Payment confirmation + credit boundary. service_role only; idempotent.
-- Never callable from a browser session; success pages never credit.
-- ---------------------------------------------------------------------------
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
BEGIN
  IF public.get_setting_num('flag_token_purchase_enabled', 0) < 1 THEN
    RAISE EXCEPTION 'token_purchase_disabled';
  END IF;
  IF _provider_mode = 'live' AND public.get_setting_num('flag_token_payments_live_enabled', 0) < 1 THEN
    RAISE EXCEPTION 'live_payments_disabled';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('token_order_credit:' || _order_id::text));

  -- replay guard: the same provider event is recorded at most once
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
  IF v_order.provider_mode <> _provider_mode THEN
    RAISE EXCEPTION 'provider_mode_mismatch';
  END IF;
  IF v_order.status = 'credited' THEN
    RETURN jsonb_build_object('ok', true, 'already_credited', true, 'order_id', _order_id);
  END IF;
  IF v_order.status NOT IN ('created','payment_pending','paid') THEN
    RAISE EXCEPTION 'order_not_payable';
  END IF;

  UPDATE public.token_orders
     SET status = 'payment_pending'
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

  -- token quantity and target team come from the immutable order snapshot
  SELECT public.credit_tokens(v_order.team_id, v_order.token_quantity, 'purchase', _order_id,
                              'token order ' || _order_id::text)
    INTO v_tx_id;

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