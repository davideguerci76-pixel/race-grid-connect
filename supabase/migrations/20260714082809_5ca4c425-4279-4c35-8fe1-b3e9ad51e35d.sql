CREATE OR REPLACE FUNCTION public.tg_recompute_on_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_matches(OLD.freelancer_id, NULL);
    RETURN OLD;
  END IF;

  PERFORM public.recompute_matches(NEW.freelancer_id, NULL);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_recompute_on_availability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_recompute_on_availability() FROM anon;
REVOKE ALL ON FUNCTION public.tg_recompute_on_availability() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tg_recompute_on_availability() TO service_role;

REVOKE ALL ON FUNCTION public.tg_recompute_on_request() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_recompute_on_request() FROM anon;
REVOKE ALL ON FUNCTION public.tg_recompute_on_request() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tg_recompute_on_request() TO service_role;