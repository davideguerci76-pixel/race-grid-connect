-- STEP 6.8.R.2 — data-path fix only.
-- public.red_cancel_quote() has OUT params (eligible, reason, refund_tokens); the final
-- "actual charge" lookup used the unqualified column token_transactions.reason, which
-- PL/pgSQL resolved ambiguously -> ERROR 42702, reachable ONLY on the eligible path.
-- Result: a legitimately eligible RED Pit Call made the quote fail and the UI hid the CTA.
-- Eligibility conditions, ordering, Post Identical zero-refund and the refund amount
-- (100% of the actual request_post charge) are unchanged.
CREATE OR REPLACE FUNCTION public.red_cancel_quote(_request_id uuid)
RETURNS TABLE (eligible boolean, reason text, refund_tokens integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _r public.requests%ROWTYPE;
  _spent integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RETURN QUERY SELECT false, 'not_authenticated'::text, 0; RETURN;
  END IF;

  SELECT * INTO _r FROM public.requests WHERE id = _request_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::text, 0; RETURN;
  END IF;
  IF _r.team_id <> _uid THEN
    RETURN QUERY SELECT false, 'not_owner'::text, 0; RETURN;
  END IF;
  IF _r.red_cancelled_at IS NOT NULL OR _r.refund_kind IS NOT NULL OR _r.partial_refund_taken THEN
    RETURN QUERY SELECT false, 'already_refunded'::text, 0; RETURN;
  END IF;
  IF _r.status <> 'pending_review' THEN
    RETURN QUERY SELECT false, 'not_in_review'::text, 0; RETURN;
  END IF;
  IF _r.review_deadline_at IS NOT NULL AND now() >= _r.review_deadline_at THEN
    RETURN QUERY SELECT false, 'review_window_ended'::text, 0; RETURN;
  END IF;
  IF COALESCE(_r.initial_match_potential, '') <> 'red'
     OR COALESCE(_r.ever_full_matched, false)
     OR COALESCE(_r.ever_partial_matched, false)
     OR COALESCE(_r.match_potential_current, '') <> 'red' THEN
    RETURN QUERY SELECT false, 'not_red_only'::text, 0; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE request_id = _request_id AND stale = false)
     OR EXISTS (SELECT 1 FROM public.engagements WHERE request_id = _request_id
                  AND status IN ('proposed','confirmed','completed')) THEN
    RETURN QUERY SELECT false, 'has_matches_or_engagements'::text, 0; RETURN;
  END IF;

  -- Qualified column reference: tt.reason (never the OUT parameter "reason").
  SELECT COALESCE(SUM(-tt.delta), 0)::int INTO _spent
  FROM public.token_transactions tt
  WHERE tt.user_id = _uid AND tt.ref_id = _request_id AND tt.reason = 'request_post';

  -- Post Identical Pit Calls can be cancelled but are never refundable.
  IF COALESCE(_r.repost_identical, false) THEN
    RETURN QUERY SELECT true, 'repost_identical_no_refund'::text, 0; RETURN;
  END IF;

  RETURN QUERY SELECT true, 'eligible'::text, _spent;
END;
$$;

REVOKE ALL ON FUNCTION public.red_cancel_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.red_cancel_quote(uuid) TO authenticated, service_role;