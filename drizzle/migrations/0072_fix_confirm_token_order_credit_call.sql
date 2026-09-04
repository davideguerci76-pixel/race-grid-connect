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