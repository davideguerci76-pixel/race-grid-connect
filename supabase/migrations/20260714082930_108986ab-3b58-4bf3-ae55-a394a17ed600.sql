DROP TRIGGER IF EXISTS trg_recompute_on_freelancer_profile_insert ON public.freelancer_profiles;
DROP TRIGGER IF EXISTS trg_recompute_on_freelancer_profile_update ON public.freelancer_profiles;

CREATE OR REPLACE FUNCTION public.tg_recompute_on_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_matches(NULL, OLD.id);
    RETURN OLD;
  END IF;

  PERFORM public.recompute_matches(NULL, NEW.id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_recompute_on_request() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_recompute_on_request() FROM anon;
REVOKE ALL ON FUNCTION public.tg_recompute_on_request() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tg_recompute_on_request() TO service_role;