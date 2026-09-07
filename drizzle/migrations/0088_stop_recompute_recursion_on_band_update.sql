CREATE OR REPLACE FUNCTION public.tg_recompute_on_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_matches(NULL, OLD.id);
    RETURN OLD;
  END IF;

  -- The current coverage band is derived FROM the matches; refreshing it must
  -- never trigger another matching pass (that recursion timed out the statement).
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'match_potential_current' - 'updated_at')
       = (to_jsonb(OLD) - 'match_potential_current' - 'updated_at') THEN
    RETURN NEW;
  END IF;

  PERFORM public.recompute_matches(NULL, NEW.id);
  PERFORM public.emit_potential_match_notifications(NULL, NEW.id);
  RETURN NEW;
END;
$$;