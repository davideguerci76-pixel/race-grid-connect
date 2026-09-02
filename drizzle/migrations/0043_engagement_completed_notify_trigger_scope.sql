DROP TRIGGER IF EXISTS z_engagement_completed_notify ON public.engagements;
CREATE TRIGGER z_engagement_completed_notify
AFTER UPDATE ON public.engagements
FOR EACH ROW
WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.tg_engagement_completed_notify();