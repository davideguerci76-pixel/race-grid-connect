DROP TRIGGER IF EXISTS trg_recompute_on_availability_insert ON public.availability;
DROP TRIGGER IF EXISTS trg_recompute_on_availability_delete ON public.availability;
DROP TRIGGER IF EXISTS trg_recompute_on_request_insert ON public.requests;
DROP TRIGGER IF EXISTS trg_recompute_on_request_update ON public.requests;
DROP TRIGGER IF EXISTS trg_freelancer_profiles_updated_at ON public.freelancer_profiles;
DROP TRIGGER IF EXISTS trg_team_profiles_updated_at ON public.team_profiles;
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;

DROP TRIGGER IF EXISTS freelancer_profiles_recompute ON public.freelancer_profiles;
CREATE TRIGGER freelancer_profiles_recompute
AFTER INSERT OR UPDATE OF role, disciplines, skills ON public.freelancer_profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_on_freelancer_profile();