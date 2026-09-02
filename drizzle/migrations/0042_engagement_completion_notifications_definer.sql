CREATE OR REPLACE FUNCTION public.emit_engagement_completed_notifications(_engagement_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _e public.engagements%ROWTYPE;
  _n integer := 0;
BEGIN
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Only ever emits for genuinely completed engagements
  IF _e.status <> 'completed' THEN
    RETURN 0;
  END IF;

  -- Client callers must be a party of the engagement
  IF current_user IN ('authenticated', 'anon')
     AND auth.uid() IS DISTINCT FROM _e.freelancer_id
     AND auth.uid() IS DISTINCT FROM _e.team_id THEN
    RETURN 0;
  END IF;

  INSERT INTO public.notifications(user_id, kind, payload, is_test)
  SELECT u, 'engagement_completed', jsonb_build_object('engagement_id', _e.id), _e.is_test
  FROM (VALUES (_e.freelancer_id), (_e.team_id)) AS t(u)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = t.u
      AND n.kind = 'engagement_completed'
      AND n.payload->>'engagement_id' = _e.id::text
  );

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_engagement_completed_notifications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emit_engagement_completed_notifications(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_engagement_completion_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.freelancer_marked_complete AND NEW.team_marked_complete AND NEW.status <> 'completed' THEN
    NEW.status := 'completed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_engagement_completed_notify()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    PERFORM public.emit_engagement_completed_notifications(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS z_engagement_completed_notify ON public.engagements;
CREATE TRIGGER z_engagement_completed_notify
AFTER UPDATE OF status ON public.engagements
FOR EACH ROW
EXECUTE FUNCTION public.tg_engagement_completed_notify();