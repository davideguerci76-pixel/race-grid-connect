-- STEP 6.8.R — Pit Call economic state machine (server-authoritative)
-- Adds a single readable economic truth function and aligns the execution
-- authority with it. Matching law, RED Cancel, tier/profile unlock pricing and
-- Post Identical posting cost are untouched.

CREATE OR REPLACE FUNCTION public.request_refund_state(_request_id uuid)
RETURNS TABLE(
  state text,
  spent integer,
  refund_pct numeric,
  zero_match_refund integer,
  partial_refund integer,
  low_relevance_refund integer,
  low_relevance_eligible boolean,
  best_refund integer,
  refund_kind text,
  refund_available boolean,
  closes_request boolean,
  non_refundable boolean,
  reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r public.requests%ROWTYPE;
  _q record;
  _exhausted boolean;
  _has_full boolean;
  _has_partial boolean;
  _has_engagement boolean;
  _zero integer := 0;
  _partial integer := 0;
  _low integer := 0;
  _low_ok boolean := false;
  _state text;
  _best integer := 0;
  _kind text := NULL;
  _avail boolean := false;
  _reason text := NULL;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _r
  FROM public.requests
  WHERE id = _request_id
    AND team_id = _uid
    AND is_test = public.env_is_test();
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  SELECT * INTO _q FROM public.request_refund_quote(_request_id);
  _zero := COALESCE(_q.zero_match_refund_full, 0);
  _low_ok := COALESCE(_q.low_relevance_eligible, false);
  _low := CASE WHEN _low_ok THEN COALESCE(_q.low_relevance_refund, 0) ELSE 0 END;
  _partial := CASE WHEN _zero > 0 THEN GREATEST(1, ROUND(_zero / 2.0)::int) ELSE 0 END;

  -- Historical exhaustion: every produced match was declined or let expire.
  SELECT EXISTS(
    SELECT 1 FROM public.engagements
    WHERE request_id = _request_id
      AND status = 'cancelled'
      AND cancellation_kind IN ('freelancer_declined','expired')
  ) INTO _exhausted;

  SELECT EXISTS(
    SELECT 1 FROM public.matches m
    WHERE m.request_id = _request_id
      AND m.is_partial = false
      AND NOT EXISTS (
        SELECT 1 FROM public.engagements e
        WHERE e.request_id = _request_id
          AND e.freelancer_id = m.freelancer_id
          AND e.status = 'cancelled'
          AND e.cancellation_kind IN ('freelancer_declined','expired')
      )
  ) OR (COALESCE(_r.ever_full_matched, false) AND NOT _exhausted) INTO _has_full;

  SELECT EXISTS(SELECT 1 FROM public.matches WHERE request_id = _request_id AND is_partial = true)
         OR COALESCE(_r.ever_partial_matched, false) INTO _has_partial;

  SELECT EXISTS(
    SELECT 1 FROM public.engagements
    WHERE request_id = _request_id
      AND status IN ('proposed','confirmed','completed')
  ) INTO _has_engagement;

  -- ---- state machine -------------------------------------------------
  IF COALESCE(_r.repost_identical, false) THEN
    _state := 'non_refundable';
    _reason := 'post_identical';
  ELSIF COALESCE(_r.partial_refund_taken, false) OR _r.refund_kind IS NOT NULL THEN
    _state := 'non_refundable';
    _reason := 'already_refunded';
  ELSIF _has_engagement THEN
    _state := 'non_refundable';
    _reason := 'engagement_exists';
  ELSIF _has_full THEN
    _state := 'full';
    _reason := 'full_match_exists';
  ELSIF _has_partial THEN
    _state := 'partial_only';
  ELSE
    _state := 'zero_match';
  END IF;

  IF _state = 'zero_match' THEN
    _best := _zero; _kind := 'full';
  ELSIF _state = 'partial_only' THEN
    -- Never stack: the single most favourable applicable policy wins.
    IF _low_ok AND _low > _partial THEN
      _best := _low; _kind := 'low_relevance';
    ELSE
      _best := _partial; _kind := 'partial';
    END IF;
  ELSIF _state = 'full' AND _low_ok THEN
    -- Preserved existing exception: low professional relevance stays payable.
    _best := _low; _kind := 'low_relevance';
    _state := 'low_relevance';
  ELSE
    _best := 0; _kind := NULL;
  END IF;

  _avail := _best > 0 AND _kind IS NOT NULL;
  IF NOT _avail AND _reason IS NULL THEN _reason := 'no_refund_due'; END IF;

  RETURN QUERY SELECT
    _state, COALESCE(_q.spent, 0), COALESCE(_q.refund_pct, 0),
    _zero, _partial, _low, _low_ok,
    CASE WHEN _avail THEN _best ELSE 0 END,
    CASE WHEN _avail THEN _kind ELSE NULL END,
    _avail,
    _avail, -- every ordinary refund closes the Pit Call
    (_state = 'non_refundable' AND _reason = 'post_identical'),
    _reason;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_refund_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_refund_state(uuid) TO authenticated, service_role;

-- Execution authority: server recomputes eligibility, mode and amount.
CREATE OR REPLACE FUNCTION public.refund_and_close_request(_request_id uuid, _mode text)
RETURNS TABLE(refund_tokens integer, refund_pct numeric, balance integer, kind text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r public.requests%ROWTYPE;
  _s record;
  _refund integer;
  _kind text;
  _new_bal integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _mode IS NOT NULL AND _mode NOT IN ('full','partial') THEN RAISE EXCEPTION 'Invalid mode'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('refund-request:' || _request_id::text, 0));

  SELECT * INTO _r FROM public.requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _r.team_id <> _uid THEN RAISE EXCEPTION 'Not owner'; END IF;
  IF _r.is_test <> public.env_is_test() THEN RAISE EXCEPTION 'Not owner'; END IF;
  IF _r.partial_refund_taken OR _r.refund_kind IS NOT NULL THEN
    RAISE EXCEPTION 'A refund has already been granted for this request';
  END IF;

  SELECT * INTO _s FROM public.request_refund_state(_request_id);

  IF NOT COALESCE(_s.refund_available, false) THEN
    RAISE EXCEPTION 'No refund is available for this request (%)', COALESCE(_s.reason, 'not_eligible');
  END IF;

  _refund := _s.best_refund;
  _kind := _s.refund_kind;

  _new_bal := public.credit_tokens(
    _uid, _refund, 'refund'::public.token_reason, _request_id,
    'Pit Call refund (' || _kind || ') — ' || _refund || ' token(s)'
  );

  -- Every ordinary refund closes the Pit Call. Refunds never unlock anything.
  UPDATE public.requests
     SET status = 'completed',
         is_active = false,
         refund_pct = _s.refund_pct,
         refund_tokens = _refund,
         refund_kind = _kind,
         partial_refund_taken = true,
         updated_at = now()
   WHERE id = _request_id;

  RETURN QUERY SELECT _refund, _s.refund_pct, _new_bal, _kind;
END;
$function$;