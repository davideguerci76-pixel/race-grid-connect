-- UAT-ONBOARD-03 fix: text[] || 'literal' was parsed as array literal (22P02). Use array_append.
-- Also: zero active days with any future rows is labeled stale_availability ("review"), otherwise missing_availability.
CREATE OR REPLACE FUNCTION public.my_activation_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _has_profile boolean;
  _has_role boolean;
  _phone_ok boolean;
  _future_days integer := 0;
  _active_days integer := 0;
  _stale_days integer := 0;
  _max_age_days numeric;
  _confirmed_at timestamptz;
  _reasons text[] := ARRAY[]::text[];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT true, fp.role_group IS NOT NULL AND btrim(fp.role_group) <> '', fp.calendar_last_confirmed_at
    INTO _has_profile, _has_role, _confirmed_at
  FROM public.freelancer_profiles fp
  WHERE fp.user_id = _uid;

  IF NOT COALESCE(_has_profile, false) THEN
    RETURN jsonb_build_object('is_freelancer', false, 'ready', false, 'reasons', '[]'::jsonb);
  END IF;

  _max_age_days := COALESCE(public.get_setting_num('availability_max_age_days', 90), 90);

  SELECT
    count(*),
    count(*) FILTER (WHERE public.availability_day_active(_uid, a.day)),
    count(*) FILTER (WHERE GREATEST(COALESCE(_confirmed_at, '-infinity'::timestamptz), a.created_at)
                          <= now() - (_max_age_days || ' days')::interval)
    INTO _future_days, _active_days, _stale_days
  FROM public.availability a
  WHERE a.freelancer_id = _uid
    AND a.day >= now()::date;

  SELECT EXISTS (
    SELECT 1 FROM public.freelancer_contacts c
    WHERE c.user_id = _uid
      AND c.phone_dial_code ~ '^\+[0-9]{1,4}$'
      AND length(btrim(COALESCE(c.phone_number, ''))) BETWEEN 4 AND 30
      AND btrim(c.phone_number) ~ '^[0-9 ()\-./]+$'
  ) INTO _phone_ok;

  IF NOT COALESCE(_has_role, false) THEN _reasons := array_append(_reasons, 'missing_role'); END IF;
  IF NOT COALESCE(_phone_ok, false) THEN _reasons := array_append(_reasons, 'missing_phone'); END IF;
  IF _active_days = 0 THEN
    IF _future_days > 0 THEN
      _reasons := array_append(_reasons, 'stale_availability');
    ELSE
      _reasons := array_append(_reasons, 'missing_availability');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'is_freelancer', true,
    'ready', cardinality(_reasons) = 0,
    'reasons', to_jsonb(_reasons),
    'has_role', COALESCE(_has_role, false),
    'has_phone', COALESCE(_phone_ok, false),
    'active_days', _active_days,
    'future_days', _future_days,
    'stale_days', _stale_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.my_activation_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_activation_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_activation_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_activation_status() TO service_role;