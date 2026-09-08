-- STEP 6.5.R — REMEDIATION A: a Pit Call in its post-review window stays in the
-- INTERNAL matching candidate set, so a global recompute no longer deletes the
-- match rows created by create_request (which then flipped
-- match_potential_current to 'red' through tg_refresh_match_potential).
--
-- pending_review remains NON-PUBLIC and NON-ACTIONABLE: every visibility,
-- notification and engagement guard checks status = 'active' AND is_active
-- separately, and those guards are untouched here.
--
-- Only the candidate predicate changes; scoring, weights, hard/soft rules,
-- coverage thresholds and the cleanup/insert logic are preserved byte-for-byte
-- by rewriting the function from its own current definition.
DO $mig$
DECLARE
  _def text;
  _old text := '    WHERE r.is_active = true' || chr(10);
  _new text :=
    '    -- MATCHING CANDIDATE SET (internal only): live Pit Calls plus Pit Calls' || chr(10) ||
    '    -- still inside their post-review window (STEP 6.5.R / UAT-01).' || chr(10) ||
    '    WHERE (r.is_active = true OR r.status = ''pending_review''::public.request_status)' || chr(10);
BEGIN
  SELECT pg_get_functiondef(oid) INTO _def
  FROM pg_proc
  WHERE proname = 'recompute_matches'
    AND pronamespace = 'public'::regnamespace;

  IF _def IS NULL THEN
    RAISE EXCEPTION 'public.recompute_matches not found';
  END IF;

  IF position('OR r.status = ''pending_review''' in _def) > 0 THEN
    RETURN; -- already remediated (idempotent replay)
  END IF;

  IF (length(_def) - length(replace(_def, _old, ''))) / length(_old) <> 1 THEN
    RAISE EXCEPTION 'candidate-set predicate not found exactly once in recompute_matches';
  END IF;

  EXECUTE replace(_def, _old, _new);
END;
$mig$;