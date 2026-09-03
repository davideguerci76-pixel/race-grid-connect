ALTER TABLE public.freelancer_profiles
  ADD COLUMN IF NOT EXISTS mute_availability_opportunities boolean NOT NULL DEFAULT false;

GRANT SELECT (mute_availability_opportunities) ON public.freelancer_profiles TO authenticated;
GRANT ALL ON public.freelancer_profiles TO service_role;

DO $$
DECLARE
  _definition text;
  _needle text := 'AND COALESCE(r.was_pool_request, false) = false';
  _replacement text := 'AND COALESCE(r.was_pool_request, false) = false
        AND COALESCE(fp.mute_availability_opportunities, false) = false';
BEGIN
  SELECT pg_get_functiondef('public.emit_availability_opportunity_notifications(boolean)'::regprocedure)
    INTO _definition;

  IF _definition IS NULL OR position(_needle IN _definition) = 0 THEN
    RAISE EXCEPTION 'Unable to locate the REVIEW08 availability opportunity emitter predicate';
  END IF;

  _definition := replace(_definition, _needle, _replacement);
  EXECUTE _definition;
END $$;