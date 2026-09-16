-- READY-NAME-01 — Freelancer first name + last name become a READY requirement
-- and a server-authoritative matching hard gate. Additive only: no data is parsed,
-- rewritten or destroyed; legacy display_name stays untouched.

-- 1) Single identity authority ------------------------------------------------
CREATE OR REPLACE FUNCTION public.freelancer_identity_complete(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _uid
      AND COALESCE(btrim(p.first_name), '') <> ''
      AND COALESCE(btrim(p.last_name), '') <> ''
  );
$$;

REVOKE ALL ON FUNCTION public.freelancer_identity_complete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.freelancer_identity_complete(uuid) TO service_role;

-- 2) READY authority: existing requirements preserved, first/last name added ----
CREATE OR REPLACE FUNCTION public.activation_status_for(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _has_profile boolean;
  _has_role boolean;
  _phone_ok boolean;
  _first_ok boolean;
  _last_ok boolean;
  _future_days integer := 0;
  _active_days integer := 0;
  _stale_days integer := 0;
  _max_age_days numeric;
  _confirmed_at timestamptz;
  _reasons text[] := ARRAY[]::text[];
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('is_freelancer', false, 'ready', false, 'reasons', '[]'::jsonb);
  END IF;

  SELECT true, fp.role_group IS NOT NULL AND btrim(fp.role_group) <> '', fp.calendar_last_confirmed_at
    INTO _has_profile, _has_role, _confirmed_at
  FROM public.freelancer_profiles fp
  WHERE fp.user_id = _uid;

  IF NOT COALESCE(_has_profile, false) THEN
    RETURN jsonb_build_object('is_freelancer', false, 'ready', false, 'reasons', '[]'::jsonb);
  END IF;

  SELECT COALESCE(btrim(p.first_name), '') <> '', COALESCE(btrim(p.last_name), '') <> ''
    INTO _first_ok, _last_ok
  FROM public.profiles p WHERE p.id = _uid;

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

  IF NOT COALESCE(_first_ok, false) THEN _reasons := array_append(_reasons, 'missing_first_name'); END IF;
  IF NOT COALESCE(_last_ok, false) THEN _reasons := array_append(_reasons, 'missing_last_name'); END IF;
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
    'has_first_name', COALESCE(_first_ok, false),
    'has_last_name', COALESCE(_last_ok, false),
    'active_days', _active_days,
    'future_days', _future_days,
    'stale_days', _stale_days
  );
END;
$function$;

-- 3) Matching hard gate: surgical patch of the two candidate-set functions -----
DO $do$
DECLARE d text; p text;
BEGIN
  SELECT pg_get_functiondef(pr.oid) INTO STRICT d
  FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'public' AND pr.proname = 'recompute_matches_core';

  IF position('freelancer_identity_complete' IN d) = 0 THEN
    p := replace(d,
      'JOIN public.freelancer_profiles fp ON fp.is_test = r.is_test',
      'JOIN public.freelancer_profiles fp ON fp.is_test = r.is_test AND public.freelancer_identity_complete(fp.user_id)');
    IF p = d THEN RAISE EXCEPTION 'READY_NAME_01: candidate join not found in recompute_matches_core'; END IF;
    EXECUTE p;
  END IF;

  SELECT pg_get_functiondef(pr.oid) INTO STRICT d
  FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'public' AND pr.proname = 'emit_availability_opportunity_notifications';

  IF position('freelancer_identity_complete' IN d) = 0 THEN
    p := replace(d,
      'JOIN public.freelancer_profiles fp ON fp.is_test = _is_test',
      'JOIN public.freelancer_profiles fp ON fp.is_test = _is_test AND public.freelancer_identity_complete(fp.user_id)');
    IF p = d THEN RAISE EXCEPTION 'READY_NAME_01: candidate join not found in emit_availability_opportunity_notifications'; END IF;
    EXECUTE p;
  END IF;
END
$do$;

-- 4) Readiness nudge: recognise the two new reasons (ACP coherence) ------------
DO $do$
DECLARE d text; p text;
BEGIN
  SELECT pg_get_functiondef(pr.oid) INTO STRICT d
  FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'public' AND pr.proname = 'admin_readiness_nudge';

  IF position('missing_first_name' IN d) = 0 THEN
    p := replace(d,
      '''missing_role'',''missing_phone'',''missing_availability'',''stale_availability''',
      '''missing_first_name'',''missing_last_name'',''missing_role'',''missing_phone'',''missing_availability'',''stale_availability''');
    p := replace(p,
      'WHEN _rs ? ''missing_role'' THEN ''missing_role''',
      'WHEN _rs ? ''missing_first_name'' THEN ''missing_first_name''
      WHEN _rs ? ''missing_last_name'' THEN ''missing_last_name''
      WHEN _rs ? ''missing_role'' THEN ''missing_role''');
    p := replace(p,
      'WHEN ''missing_role'' THEN ''add your professional role''',
      'WHEN ''missing_first_name'' THEN ''add your first name''
               WHEN ''missing_last_name'' THEN ''add your last name''
               WHEN ''missing_role'' THEN ''add your professional role''');
    IF p = d THEN RAISE EXCEPTION 'READY_NAME_01: admin_readiness_nudge patch targets not found'; END IF;
    EXECUTE p;
  END IF;
END
$do$;

-- 5) Signup: persist first/last name supplied at registration (freelancers) ----
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_type public.user_type;
  _display TEXT;
  _first TEXT;
  _last TEXT;
  _is_admin BOOLEAN;
  _bonus int;
  _is_test BOOLEAN;
BEGIN
  _user_type := COALESCE((NEW.raw_user_meta_data->>'user_type')::public.user_type, 'freelancer');
  _first := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'first_name', '')), '');
  _last := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'last_name', '')), '');
  IF _user_type <> 'freelancer' THEN
    _first := NULL;
    _last := NULL;
  END IF;
  _display := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NULLIF(btrim(COALESCE(_first, '') || ' ' || COALESCE(_last, '')), ''),
    split_part(NEW.email, '@', 1)
  );

  -- Environment authority: reserved synthetic-account domains AND the explicit creation flag.
  _is_test := COALESCE((NEW.raw_user_meta_data->>'is_test')::boolean, false)
              AND (
                NEW.email ILIKE '%@test-pitcall.invalid'
                OR NEW.email ILIKE '%@testlab.pitcall.net'
              );

  INSERT INTO public.profiles(id, user_type, display_name, is_test, first_name, last_name)
  VALUES (NEW.id, _user_type, _display, _is_test, _first, _last);

  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user');

  SELECT EXISTS(SELECT 1 FROM public.admin_emails WHERE email = NEW.email) INTO _is_admin;
  IF _is_admin THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF _user_type = 'freelancer' THEN
    INSERT INTO public.freelancer_profiles(user_id) VALUES (NEW.id);
  ELSE
    INSERT INTO public.team_profiles(user_id, team_name, initials)
    VALUES (NEW.id, _display, upper(left(regexp_replace(_display, '[^A-Za-z]', '', 'g'), 2)));
  END IF;

  _bonus := public.get_setting_num('reward_signup_bonus', 5)::int;
  IF _bonus > 0 THEN
    PERFORM public.credit_tokens(NEW.id, _bonus, 'signup_bonus', NULL, 'Welcome bonus');
  END IF;
  RETURN NEW;
END;
$function$;