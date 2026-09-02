CREATE OR REPLACE FUNCTION public.tg_env_session_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_test, false) IS DISTINCT FROM public.env_is_test() THEN
    RAISE EXCEPTION 'Environment mismatch: this session operates in % but the row belongs to %',
      CASE WHEN public.env_is_test() THEN 'TEST' ELSE 'LIVE' END,
      CASE WHEN COALESCE(NEW.is_test, false) THEN 'TEST' ELSE 'LIVE' END
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS z_env_session_guard ON public.requests;
CREATE TRIGGER z_env_session_guard
  BEFORE INSERT ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_env_session_guard();