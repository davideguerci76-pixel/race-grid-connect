-- STEP 6.7.R — PARTIAL MATCH AVAILABILITY LAW: >= 50% TEMPORAL COVERAGE
-- Authority: public.recompute_matches (single-request branch).
-- FULL  : covered = required
-- PARTIAL: covered >= 1 AND covered * 2 >= required AND covered < required
-- NO MATCH: covered * 2 < required
-- Season and Pool branches keep their existing dedicated semantics.
DO $mig$
DECLARE
  _def text;
  _new text;
BEGIN
  -- 1) recompute_matches: replace the 30% missing-pct gate with integer 50% coverage law.
  SELECT pg_get_functiondef(p.oid) INTO _def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'recompute_matches';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'recompute_matches not found';
  END IF;

  _new := replace(
    _def,
    'WHEN c.is_season THEN c.missing_pct_v <= _max_season ELSE c.missing_pct_v <= _max_single END',
    'WHEN c.is_season THEN c.missing_pct_v <= _max_season ELSE (c.overlap_days * 2) >= c.required_days END'
  );

  IF _new = _def THEN
    RAISE EXCEPTION 'recompute_matches: partial coverage gate pattern not found';
  END IF;

  EXECUTE _new;

  -- 2) availability opportunity: nudge everyone still BELOW the partial coverage law,
  --    not only zero-coverage freelancers.
  SELECT pg_get_functiondef(p.oid) INTO _def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'emit_availability_opportunity_notifications';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'emit_availability_opportunity_notifications not found';
  END IF;

  _new := replace(
    _def,
    'AND (h.s).required_days > 0 AND (h.s).overlap_days = 0',
    'AND (h.s).required_days > 0 AND ((h.s).overlap_days * 2) < (h.s).required_days'
  );

  IF _new = _def THEN
    RAISE EXCEPTION 'availability opportunity: coverage gate pattern not found';
  END IF;

  EXECUTE _new;
END
$mig$;

-- Keep the legacy setting row documented as superseded for normal single-request matching.
UPDATE public.platform_settings
   SET description = 'SUPERSEDED for normal single Pit Call Full/Partial classification (STEP 6.7.R): partial now requires covered_days*2 >= required_days. Retained for legacy/season tooling only.',
       updated_at = now()
 WHERE key = 'partial_single_max_missing_pct';
