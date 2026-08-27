CREATE OR REPLACE FUNCTION public.tg_recompute_on_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_matches(NULL, OLD.id);
    RETURN OLD;
  END IF;
  PERFORM public.recompute_matches(NULL, NEW.id);
  PERFORM public.emit_potential_match_notifications(NULL, NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_recompute_on_availability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_matches(OLD.freelancer_id, NULL);
    RETURN OLD;
  END IF;
  PERFORM public.recompute_matches(NEW.freelancer_id, NULL);
  PERFORM public.emit_potential_match_notifications(NEW.freelancer_id, NULL);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_recompute_on_freelancer_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.recompute_matches(NEW.user_id, NULL);
  PERFORM public.emit_potential_match_notifications(NEW.user_id, NULL);
  RETURN NEW;
END;
$function$;