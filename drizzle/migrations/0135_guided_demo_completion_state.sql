ALTER TABLE public.profiles
  ADD COLUMN guided_demo_completed_at timestamptz;

COMMENT ON COLUMN public.profiles.guided_demo_completed_at IS
  'One-way account-level marker set only after a Team completes the client-only Guided Demo Pit Call.';

CREATE OR REPLACE FUNCTION public.mark_guided_demo_completed()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_completed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET guided_demo_completed_at = COALESCE(guided_demo_completed_at, now())
  WHERE id = auth.uid()
    AND user_type = 'team'::public.user_type
    AND blocked_at IS NULL
    AND deleted_at IS NULL
  RETURNING guided_demo_completed_at INTO v_completed_at;

  IF v_completed_at IS NULL THEN
    RAISE EXCEPTION 'TEAM_ACCOUNT_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN v_completed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_guided_demo_completed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_guided_demo_completed() FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_guided_demo_completed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_guided_demo_completed() TO service_role;