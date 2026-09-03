-- Read-only eligibility check: no row lock is needed or allowed in a STABLE function.
CREATE OR REPLACE FUNCTION public.request_expand_eligibility(_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req public.requests%ROWTYPE;
  _threshold numeric;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO _req FROM public.requests WHERE id = _request_id;

  IF NOT FOUND OR _req.team_id <> _uid OR _req.is_test <> public.env_is_test()
     OR _req.search_mode IS DISTINCT FROM 'pool' OR NOT _req.is_active THEN
    RETURN false;
  END IF;

  _threshold := COALESCE(public.get_setting_num('professional_relevance_threshold', 50), 50);

  RETURN EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.request_id = _request_id
      AND m.team_id = _uid
      AND m.is_test = public.env_is_test()
      AND m.stale = false
      AND m.overlap_days > 0
      AND m.skills_score >= _threshold
      AND NOT EXISTS (
        SELECT 1
        FROM public.team_pool tp
        WHERE tp.team_id = _uid
          AND tp.freelancer_id = m.freelancer_id
          AND tp.is_test = public.env_is_test()
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_expand_eligibility(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_expand_eligibility(uuid) TO authenticated, service_role;