-- MT09-C1/C2/C3: revoke public/authenticated EXECUTE on internal-only routines.
REVOKE EXECUTE ON FUNCTION public.recompute_matches_env(boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_proposed_for_request(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_no_confirmable_matches(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_matches_env(boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_proposed_for_request(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_no_confirmable_matches(uuid) TO service_role;

-- MT09-M1: atomic, concurrency-safe admin token balance adjustment (absolute-set semantics preserved).
CREATE OR REPLACE FUNCTION public.admin_set_token_balance(_user_id uuid, _balance integer, _admin uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _current integer; _delta integer; _is_test boolean;
BEGIN
  IF _balance IS NULL OR _balance < 0 OR _balance > 1000000 THEN
    RAISE EXCEPTION 'Invalid balance';
  END IF;
  IF NOT public.has_role(_admin, 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  SELECT token_balance, is_test INTO _current, _is_test
  FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;

  _delta := _balance - _current;

  IF _delta <> 0 THEN
    INSERT INTO public.token_transactions(user_id, delta, reason, ref_id, note, is_test)
    VALUES (_user_id, _delta,
            (CASE WHEN _delta > 0 THEN 'admin_credit' ELSE 'admin_debit' END)::token_reason,
            NULL, 'Admin adjustment by ' || _admin::text, _is_test);

    UPDATE public.profiles SET token_balance = _balance, updated_at = now() WHERE id = _user_id;
  END IF;

  INSERT INTO public.admin_audit_log(admin_id, target_user_id, action, details)
  VALUES (_admin, _user_id, 'set_token_balance',
          jsonb_build_object('before', _current, 'after', _balance, 'delta', _delta, 'is_test', _is_test));

  RETURN jsonb_build_object('ok', true, 'before', _current, 'after', _balance, 'delta', _delta);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_set_token_balance(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_token_balance(uuid, integer, uuid) TO service_role;

-- MT09-M4: whitelisted, bounded, all-or-nothing platform settings update with audit.
CREATE OR REPLACE FUNCTION public.admin_update_settings(_updates jsonb, _admin uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _u jsonb; _key text; _val numeric; _before numeric; _unit text;
  _changes jsonb := '[]'::jsonb; _cnt int := 0;
  _pct text[] := ARRAY['refund_min_pct','refund_hard_penalty_pct','partial_single_max_missing_pct',
                       'partial_season_max_missing_pct','partial_single_penalty_per_day',
                       'sos_min_match_pct','professional_relevance_threshold'];
  _g_check numeric; _g_r1 numeric; _g_r2 numeric; _g_dl numeric;
BEGIN
  IF NOT public.has_role(_admin, 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
  IF _updates IS NULL OR jsonb_typeof(_updates) <> 'array' OR jsonb_array_length(_updates) = 0 THEN
    RAISE EXCEPTION 'No updates provided';
  END IF;

  FOR _u IN SELECT * FROM jsonb_array_elements(_updates) LOOP
    _key := _u->>'key';
    IF _key IS NULL THEN RAISE EXCEPTION 'Missing setting key'; END IF;
    BEGIN
      _val := (_u->>'value_num')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Setting %: value must be numeric', _key;
    END;
    IF _val IS NULL THEN RAISE EXCEPTION 'Setting %: value must be numeric', _key; END IF;

    SELECT value_num, unit INTO _before, _unit FROM public.platform_settings WHERE key = _key FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown setting: %', _key; END IF;

    -- type / range semantics
    IF _key = 'token_price_eur' THEN
      IF _val <= 0 OR _val > 100000 THEN RAISE EXCEPTION 'Setting %: price must be greater than 0', _key; END IF;
      IF round(_val, 2) <> _val THEN RAISE EXCEPTION 'Setting %: max 2 decimals', _key; END IF;
    ELSE
      IF _val <> trunc(_val) THEN RAISE EXCEPTION 'Setting %: must be an integer', _key; END IF;
      IF _val < 0 THEN RAISE EXCEPTION 'Setting %: must be >= 0', _key; END IF;
      IF _val > 1000000000 THEN RAISE EXCEPTION 'Setting %: value out of range', _key; END IF;
      IF _key LIKE 'flag\_%' OR _unit = 'bool' THEN
        IF _val NOT IN (0, 1) THEN RAISE EXCEPTION 'Setting %: must be 0 or 1', _key; END IF;
      ELSIF _key = ANY(_pct) THEN
        IF _val > 100 THEN RAISE EXCEPTION 'Setting %: percentage must be between 0 and 100', _key; END IF;
      END IF;
    END IF;

    IF _key = 'token_price_eur' THEN
      PERFORM public.admin_set_token_price_eur(_val, _admin);
    ELSE
      UPDATE public.platform_settings
        SET value_num = _val, updated_at = now(), updated_by = _admin
        WHERE key = _key;
    END IF;

    _changes := _changes || jsonb_build_object('key', _key, 'before', _before, 'after', _val);
    _cnt := _cnt + 1;
  END LOOP;

  -- cross-field invariant already implied by the anti-ghosting product law
  SELECT value_num INTO _g_check FROM public.platform_settings WHERE key = 'ghosting_freelance_check_days';
  SELECT value_num INTO _g_r1 FROM public.platform_settings WHERE key = 'ghosting_team_reminder1_days';
  SELECT value_num INTO _g_r2 FROM public.platform_settings WHERE key = 'ghosting_team_reminder2_days';
  SELECT value_num INTO _g_dl FROM public.platform_settings WHERE key = 'ghosting_deadline_days';
  IF _g_check IS NOT NULL AND NOT (_g_check < _g_r1 AND _g_r1 < _g_r2 AND _g_r2 < _g_dl) THEN
    RAISE EXCEPTION 'Anti-ghosting thresholds must be strictly increasing (check < reminder1 < reminder2 < deadline)';
  END IF;

  INSERT INTO public.admin_audit_log(admin_id, target_user_id, action, details)
  VALUES (_admin, NULL, 'update_platform_settings', jsonb_build_object('changes', _changes));

  RETURN jsonb_build_object('ok', true, 'count', _cnt, 'changes', _changes);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_update_settings(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_settings(jsonb, uuid) TO service_role;