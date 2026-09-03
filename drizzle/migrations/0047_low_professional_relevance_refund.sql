ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS ever_relevant_match boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS was_pool_request boolean NOT NULL DEFAULT false;

-- Preserve the fact that a request originated in IN MY POOL, including requests
-- already expanded to standard search before this migration.
UPDATE public.requests r
   SET was_pool_request = true
 WHERE r.was_pool_request = false
   AND (
     r.search_mode = 'pool'
     OR EXISTS (
       SELECT 1
       FROM public.pool_search_unlocks u
       WHERE u.request_id = r.id
     )
   );

CREATE OR REPLACE FUNCTION public.tg_preserve_request_origin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.was_pool_request := COALESCE(NEW.was_pool_request, false) OR NEW.search_mode = 'pool';
  ELSE
    NEW.was_pool_request := COALESCE(OLD.was_pool_request, false)
      OR COALESCE(NEW.was_pool_request, false)
      OR NEW.search_mode = 'pool';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS requests_preserve_origin ON public.requests;
CREATE TRIGGER requests_preserve_origin
  BEFORE INSERT OR UPDATE OF search_mode, was_pool_request ON public.requests
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_preserve_request_origin();

-- Historical relevance is driven by the existing professional score column.
-- The trigger includes UPDATE because recompute_matches upserts existing match
-- rows and can change skills_score without inserting a new row.
CREATE OR REPLACE FUNCTION public.tg_mark_request_ever_matched()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _threshold numeric := COALESCE(public.get_setting_num('professional_relevance_threshold', 50), 50);
BEGIN
  UPDATE public.requests r
     SET ever_full_matched = r.ever_full_matched OR (NEW.is_partial = false),
         ever_partial_matched = r.ever_partial_matched OR (NEW.is_partial = true),
         ever_relevant_match = r.ever_relevant_match OR (
           NOT COALESCE(r.was_pool_request, false)
           AND NEW.skills_score IS NOT NULL
           AND NEW.skills_score >= _threshold
         )
   WHERE r.id = NEW.request_id
     AND (
       r.ever_full_matched IS DISTINCT FROM (r.ever_full_matched OR (NEW.is_partial = false))
       OR r.ever_partial_matched IS DISTINCT FROM (r.ever_partial_matched OR (NEW.is_partial = true))
       OR r.ever_relevant_match IS DISTINCT FROM (r.ever_relevant_match OR (
         NOT COALESCE(r.was_pool_request, false)
         AND NEW.skills_score IS NOT NULL
         AND NEW.skills_score >= _threshold
       ))
     );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_matches_mark_ever_matched ON public.matches;
CREATE TRIGGER tg_matches_mark_ever_matched
  AFTER INSERT OR UPDATE OF is_partial, skills_score ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_mark_request_ever_matched();

-- Backfill the monotonic flag from materialized match results using the
-- current REVIEW03 authority. Future changes can only move it false -> true.
UPDATE public.requests r
   SET ever_relevant_match = true
 WHERE r.ever_relevant_match = false
   AND NOT COALESCE(r.was_pool_request, false)
   AND EXISTS (
     SELECT 1
     FROM public.matches m
     WHERE m.request_id = r.id
       AND m.skills_score IS NOT NULL
       AND m.skills_score >= COALESCE(public.get_setting_num('professional_relevance_threshold', 50), 50)
   );

-- One read authority is shared by the quote UI and refund mutation. It keeps
-- the internal threshold and hard-filter formula out of the Team-facing DTO.
CREATE OR REPLACE FUNCTION public.request_refund_quote(_request_id uuid)
RETURNS TABLE(
  spent integer,
  refund_pct numeric,
  zero_match_refund_full integer,
  refund_full integer,
  refund_partial integer,
  low_relevance_eligible boolean,
  low_relevance_refund integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r public.requests%ROWTYPE;
  _hard_count integer := 0;
  _min_pct numeric;
  _drop numeric;
  _pct numeric;
  _spent integer := 0;
  _zero_full integer := 0;
  _low_eligible boolean := false;
  _low_refund integer := 0;
  _lang jsonb;
  _exp jsonb;
  _threshold numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _r
  FROM public.requests
  WHERE id = _request_id
    AND team_id = _uid
    AND is_test = public.env_is_test();
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  SELECT COALESCE(SUM(-delta), 0)::int INTO _spent
  FROM public.token_transactions
  WHERE user_id = _uid AND ref_id = _request_id AND reason = 'request_post';

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

  _zero_full := ROUND(_spent * _pct / 100.0)::int;
  IF _spent > 0 AND _zero_full < 1 AND _pct > 0 THEN _zero_full := 1; END IF;

  _threshold := COALESCE(public.get_setting_num('professional_relevance_threshold', 50), 50);
  _low_eligible :=
    NOT COALESCE(_r.was_pool_request, false)
    AND COALESCE(_r.search_mode, 'standard') <> 'pool'
    AND NOT COALESCE(_r.ever_relevant_match, false)
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.request_id = _request_id
        AND m.skills_score IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.request_id = _request_id
        AND m.skills_score IS NOT NULL
        AND m.skills_score >= _threshold
    );

  _low_refund := CASE
    WHEN _zero_full > 0 THEN GREATEST(1, ROUND(_zero_full * 0.70)::int)
    ELSE 0
  END;

  RETURN QUERY SELECT
    _spent,
    _pct,
    _zero_full,
    CASE WHEN _low_eligible THEN _low_refund ELSE _zero_full END,
    GREATEST(CASE WHEN _zero_full > 0 THEN 1 ELSE 0 END, ROUND(_zero_full / 2.0)::int),
    _low_eligible,
    _low_refund;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_refund_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_refund_quote(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refund_and_close_request(_request_id uuid, _mode text)
RETURNS TABLE(refund_tokens integer, refund_pct numeric, balance integer, kind text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r public.requests%ROWTYPE;
  _quote record;
  _refund integer;
  _has_partials boolean;
  _has_confirmed boolean;
  _has_full boolean;
  _exhausted boolean;
  _new_bal integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _mode NOT IN ('full','partial') THEN RAISE EXCEPTION 'Invalid mode'; END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('refund-request:' || _request_id::text, 0)
  );

  SELECT * INTO _r
  FROM public.requests
  WHERE id = _request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _r.team_id <> _uid THEN RAISE EXCEPTION 'Not owner'; END IF;
  IF _r.is_test <> public.env_is_test() THEN RAISE EXCEPTION 'Not owner'; END IF;
  IF _r.partial_refund_taken THEN RAISE EXCEPTION 'A refund has already been granted for this request'; END IF;
  IF _r.refund_kind IS NOT NULL THEN RAISE EXCEPTION 'A refund has already been granted for this request'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.engagements
    WHERE request_id = _request_id AND status = 'confirmed'
  ) INTO _has_confirmed;
  IF _has_confirmed THEN RAISE EXCEPTION 'This request already has a confirmed match'; END IF;

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

  SELECT * INTO _quote
  FROM public.request_refund_quote(_request_id);

  -- A normal full close may use the new low-relevance amount only when every
  -- currently materialized match is below the current relevance authority and
  -- the monotonic historical flag has never been raised. Existing full/partial
  -- refund guards remain unchanged for every other case.
  IF _has_full AND NOT (_mode = 'full' AND COALESCE(_quote.low_relevance_eligible, false)) THEN
    RAISE EXCEPTION 'Full matches exist for this request — no refund available';
  END IF;

  IF _mode = 'partial' THEN
    SELECT EXISTS(SELECT 1 FROM public.matches WHERE request_id = _request_id AND is_partial = true)
           OR COALESCE(_r.ever_partial_matched, false) INTO _has_partials;
    IF NOT _has_partials THEN RAISE EXCEPTION 'No partial matches to unlock'; END IF;
  END IF;

  _refund := CASE
    WHEN _mode = 'full' THEN COALESCE(_quote.refund_full, 0)
    ELSE COALESCE(_quote.refund_partial, 0)
  END;

  IF _refund > 0 THEN
    _new_bal := public.credit_tokens(
      _uid,
      _refund,
      'refund'::public.token_reason,
      _request_id,
      CASE
        WHEN _mode = 'full' AND COALESCE(_quote.low_relevance_eligible, false)
          THEN 'Low professional relevance refund — 70% of zero-match policy refund'
        ELSE 'Zero-match refund (' || _mode || ') — ' || COALESCE(_quote.refund_pct, 0) || '% of ' || COALESCE(_quote.spent, 0)
      END
    );
  ELSE
    SELECT token_balance INTO _new_bal FROM public.profiles WHERE id = _uid;
  END IF;

  IF _mode = 'full' THEN
    UPDATE public.requests
       SET status = 'completed',
           is_active = false,
           refund_pct = _quote.refund_pct,
           refund_tokens = _refund,
           refund_kind = CASE WHEN COALESCE(_quote.low_relevance_eligible, false) THEN 'low_relevance' ELSE 'full' END,
           partial_refund_taken = true,
           updated_at = now()
     WHERE id = _request_id;
  ELSE
    UPDATE public.requests
       SET refund_pct = _quote.refund_pct,
           refund_tokens = _refund,
           refund_kind = 'partial',
           partial_refund_taken = true,
           updated_at = now()
     WHERE id = _request_id;
  END IF;

  RETURN QUERY SELECT
    _refund,
    _quote.refund_pct,
    _new_bal,
    CASE WHEN _mode = 'full' AND COALESCE(_quote.low_relevance_eligible, false) THEN 'low_relevance' ELSE _mode END;
END;
$function$;

REVOKE ALL ON FUNCTION public.refund_and_close_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_and_close_request(uuid, text) TO authenticated, service_role;