-- Refund settings
INSERT INTO public.platform_settings (key, value_num, category, label, description, unit, sort_order)
VALUES
  ('refund_min_pct', 20, 'refunds', 'Minimum refund (floor)', 'Lowest possible refund percentage on zero-match requests. Range 0–50.', 'percent', 10),
  ('refund_hard_penalty_pct', 10, 'refunds', 'Refund drop per hard filter', 'Percentage points subtracted from the 100% ceiling for every hard filter set on the request.', 'percent', 20)
ON CONFLICT (key) DO NOTHING;

-- Refund columns on requests
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS refund_pct numeric,
  ADD COLUMN IF NOT EXISTS refund_tokens integer,
  ADD COLUMN IF NOT EXISTS refund_kind text,
  ADD COLUMN IF NOT EXISTS partial_refund_taken boolean NOT NULL DEFAULT false;

-- Refund RPC
CREATE OR REPLACE FUNCTION public.refund_and_close_request(_request_id uuid, _mode text)
RETURNS TABLE(refund_tokens integer, refund_pct numeric, balance integer, kind text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _r public.requests%ROWTYPE;
  _spent integer := 0;
  _hard_count integer := 0;
  _min_pct numeric;
  _drop numeric;
  _pct numeric;
  _refund_full integer;
  _refund integer;
  _has_partials boolean;
  _has_confirmed boolean;
  _has_full boolean;
  _new_bal integer;
  _lang jsonb;
  _exp jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _mode NOT IN ('full','partial') THEN RAISE EXCEPTION 'Invalid mode'; END IF;

  SELECT * INTO _r FROM public.requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _r.team_id <> _uid THEN RAISE EXCEPTION 'Not owner'; END IF;
  IF _r.partial_refund_taken THEN RAISE EXCEPTION 'A refund has already been granted for this request'; END IF;
  IF _r.refund_kind IS NOT NULL THEN RAISE EXCEPTION 'A refund has already been granted for this request'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.engagements WHERE request_id = _request_id AND status = 'confirmed') INTO _has_confirmed;
  IF _has_confirmed THEN RAISE EXCEPTION 'This request already has a confirmed match'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.matches WHERE request_id = _request_id AND is_partial = false) INTO _has_full;
  IF _has_full THEN RAISE EXCEPTION 'Full matches exist for this request — no refund available'; END IF;

  IF _mode = 'partial' THEN
    SELECT EXISTS(SELECT 1 FROM public.matches WHERE request_id = _request_id AND is_partial = true) INTO _has_partials;
    IF NOT _has_partials THEN RAISE EXCEPTION 'No partial matches to unlock'; END IF;
  END IF;

  -- Sum of tokens spent to post this request
  SELECT COALESCE(SUM(-delta), 0)::int INTO _spent
  FROM public.token_transactions
  WHERE user_id = _uid AND ref_id = _request_id AND reason = 'request_post';

  -- Count hard filters
  _hard_count := 0;
  IF COALESCE(_r.role_hard, false) THEN _hard_count := _hard_count + 1; END IF;
  IF COALESCE(_r.travel_required, false) THEN _hard_count := _hard_count + 1; END IF;
  _hard_count := _hard_count + COALESCE(array_length(_r.skills_hard, 1), 0);
  IF COALESCE(array_length(_r.education, 1), 0) > 0 THEN _hard_count := _hard_count + 1; END IF;
  IF COALESCE(_r.location_relevance, 'not_relevant') = 'mandatory' THEN _hard_count := _hard_count + 1; END IF;
  FOR _lang IN SELECT * FROM jsonb_array_elements(COALESCE(_r.languages, '[]'::jsonb)) LOOP
    IF COALESCE((_lang->>'hard')::boolean, false) THEN _hard_count := _hard_count + 1; END IF;
  END LOOP;
  FOR _exp IN SELECT * FROM jsonb_array_elements(COALESCE(_r.experience_requirements, '[]'::jsonb)) LOOP
    IF COALESCE((_exp->>'hard')::boolean, false) THEN _hard_count := _hard_count + 1; END IF;
  END LOOP;

  _min_pct := COALESCE(public.get_setting_num('refund_min_pct', 20), 20);
  _drop := COALESCE(public.get_setting_num('refund_hard_penalty_pct', 10), 10);
  _pct := GREATEST(_min_pct, 100 - _hard_count * _drop);
  _pct := GREATEST(0, LEAST(100, _pct));

  _refund_full := ROUND(_spent * _pct / 100.0)::int;
  IF _spent > 0 AND _refund_full < 1 AND _pct > 0 THEN _refund_full := 1; END IF;

  IF _mode = 'full' THEN
    _refund := _refund_full;
  ELSE
    _refund := GREATEST(CASE WHEN _refund_full > 0 THEN 1 ELSE 0 END, ROUND(_refund_full / 2.0)::int);
  END IF;

  IF _refund > 0 THEN
    _new_bal := public.credit_tokens(_uid, _refund, 'refund'::public.token_reason, _request_id,
      'Zero-match refund (' || _mode || ') — ' || _pct || '% of ' || _spent);
  ELSE
    SELECT token_balance INTO _new_bal FROM public.profiles WHERE id = _uid;
  END IF;

  IF _mode = 'full' THEN
    UPDATE public.requests
      SET status = 'completed', is_active = false,
          refund_pct = _pct, refund_tokens = _refund, refund_kind = 'full',
          partial_refund_taken = true, updated_at = now()
      WHERE id = _request_id;
  ELSE
    UPDATE public.requests
      SET refund_pct = _pct, refund_tokens = _refund, refund_kind = 'partial',
          partial_refund_taken = true, updated_at = now()
      WHERE id = _request_id;
  END IF;

  RETURN QUERY SELECT _refund, _pct, _new_bal, _mode;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_and_close_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_and_close_request(uuid, text) TO authenticated;