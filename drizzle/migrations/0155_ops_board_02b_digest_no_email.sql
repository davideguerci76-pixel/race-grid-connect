-- OPS-BOARD-02B — the Admin onboarding digest is Notification Center + push only.
-- Email is out of scope, so digest rows are stamped as handled at insert time and
-- the generic email dispatcher never picks them up. No dispatcher change required.
CREATE OR REPLACE FUNCTION public.emit_admin_onboarding_digest(
  _is_test boolean,
  _force boolean DEFAULT false,
  _reason text DEFAULT 'threshold'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _w_at timestamptz; _w_id uuid;
  _new int; _f int; _t int; _tf int; _tt int;
  _max_at timestamptz; _max_id uuid;
  _msg text; _cnt int := 0;
  _zero uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF public.get_setting_num('flag_admin_onboarding_digest', 1) < 1 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'flag_off');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('admin_onboarding_digest:' || _is_test::text));

  INSERT INTO public.admin_onboarding_digest_state(is_test) VALUES (_is_test)
    ON CONFLICT (is_test) DO NOTHING;
  SELECT watermark_at, watermark_id INTO _w_at, _w_id
    FROM public.admin_onboarding_digest_state WHERE is_test = _is_test FOR UPDATE;

  SELECT count(*)::int,
         count(*) FILTER (WHERE p.user_type = 'freelancer')::int,
         count(*) FILTER (WHERE p.user_type = 'team')::int
    INTO _new, _f, _t
    FROM public.profiles p
   WHERE p.is_test = _is_test
     AND p.deleted_at IS NULL
     AND (p.created_at, p.id) > (_w_at, COALESCE(_w_id, _zero));

  IF COALESCE(_new, 0) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'no_pending');
  END IF;
  IF NOT COALESCE(_force, false) AND _new < 5 THEN
    RETURN jsonb_build_object('ok', true, 'pending', _new);
  END IF;

  SELECT p.created_at, p.id INTO _max_at, _max_id
    FROM public.profiles p
   WHERE p.is_test = _is_test
     AND p.deleted_at IS NULL
     AND (p.created_at, p.id) > (_w_at, COALESCE(_w_id, _zero))
   ORDER BY p.created_at DESC, p.id DESC
   LIMIT 1;

  SELECT count(*) FILTER (WHERE p.user_type = 'freelancer')::int,
         count(*) FILTER (WHERE p.user_type = 'team')::int
    INTO _tf, _tt
    FROM public.profiles p
   WHERE p.is_test = _is_test AND p.deleted_at IS NULL;

  _msg := _new || ' new users joined PITCALL — ' || _f || ' Freelancers · ' || _t
       || ' Teams. Total: ' || _tf || ' Freelancers · ' || _tt || ' Teams.';

  INSERT INTO public.notifications(user_id, kind, payload, emailed_at, email_status)
  SELECT ur.user_id, 'admin_alert',
         jsonb_build_object(
           'type', 'onboarding_digest',
           'reason', _reason,
           'catch_up', (_reason = 'catch_up'),
           'new_total', _new,
           'new_freelancers', _f,
           'new_teams', _t,
           'total_freelancers', _tf,
           'total_teams', _tt,
           'since', _w_at,
           'message', _msg
         ),
         now(), 'skipped'
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
   WHERE ur.role = 'admin' AND p.is_test = _is_test AND p.deleted_at IS NULL;
  GET DIAGNOSTICS _cnt = ROW_COUNT;

  UPDATE public.admin_onboarding_digest_state
     SET watermark_at = _max_at, watermark_id = _max_id,
         last_digest_at = now(), updated_at = now()
   WHERE is_test = _is_test;

  RETURN jsonb_build_object('ok', true, 'emitted', _new, 'recipients', _cnt, 'reason', _reason);
END;
$function$;