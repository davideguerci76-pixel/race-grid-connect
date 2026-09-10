-- Se il profilo non esiste più (cancellazione account a cascata), non ha senso
-- accodare un ricalcolo: l'INSERT in coda violerebbe la foreign key e bloccherebbe
-- l'eliminazione dell'account.
CREATE OR REPLACE FUNCTION public.tg_recompute_on_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.freelancer_id) THEN
      PERFORM public.enqueue_availability_recompute(OLD.freelancer_id, OLD.is_test);
    END IF;
    RETURN OLD;
  END IF;

  PERFORM public.enqueue_availability_recompute(NEW.freelancer_id, NEW.is_test);
  IF TG_OP = 'UPDATE' AND (OLD.freelancer_id IS DISTINCT FROM NEW.freelancer_id OR OLD.is_test IS DISTINCT FROM NEW.is_test) THEN
    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.freelancer_id) THEN
      PERFORM public.enqueue_availability_recompute(OLD.freelancer_id, OLD.is_test);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;