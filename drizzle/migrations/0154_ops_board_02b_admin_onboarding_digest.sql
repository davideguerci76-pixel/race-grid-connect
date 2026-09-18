-- OPS-BOARD-02B — Admin Onboarding Digest
-- Aggregated, Admin-only digest of new registrations (profiles rows).
-- Batch of 5 pending signups OR one daily fallback at 07:45 Europe/Rome.
-- Watermark authority is a dedicated per-environment singleton table.

CREATE TABLE IF NOT EXISTS public.admin_onboarding_digest_state (
  is_test        boolean PRIMARY KEY,
  watermark_at   timestamptz NOT NULL DEFAULT now(),
  watermark_id   uuid,
  last_digest_at timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Definer-only authority: no Data API access at all.
GRANT ALL ON public.admin_onboarding_digest_state TO service_role;
ALTER TABLE public.admin_onboarding_digest_state ENABLE ROW LEVEL SECURITY;

INSERT INTO public.admin_onboarding_digest_state(is_test, watermark_at)
VALUES (false, now()), (true, now())
ON CONFLICT (is_test) DO NOTHING;

-- ACP feature flag (presentation/emission only — never gates signup).
INSERT INTO public.platform_settings(key, value_num, category, label, description, unit, sort_order)
VALUES ('flag_admin_onboarding_digest', 1, 'flags', 'Admin Onboarding Digest',
        'Emit the aggregated Admin digest of new registrations (batch of 5 or daily 07:45 Europe/Rome).',
        'bool', 95)
ON CONFLICT (key) DO NOTHING;

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

  -- Concurrency authority: one evaluation per environment per transaction.
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

  -- Admin-only fan-out, environment matched (notifications inherit the recipient env).
  INSERT INTO public.notifications(user_id, kind, payload)
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
         )
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

REVOKE ALL ON FUNCTION public.emit_admin_onboarding_digest(boolean, boolean, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_admin_onboarding_digest(boolean, boolean, text) TO service_role;

-- Daily fallback. pg_cron runs in UTC, so the job fires at both DST candidates
-- (05:45 and 06:45 UTC) and this guard keeps exactly the one that is 07:45 in Rome.
CREATE OR REPLACE FUNCTION public.emit_admin_onboarding_digest_daily()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF to_char(now() AT TIME ZONE 'Europe/Rome', 'HH24:MI') <> '07:45' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'not_rome_0745');
  END IF;
  PERFORM public.emit_admin_onboarding_digest(false, true, 'daily');
  PERFORM public.emit_admin_onboarding_digest(true, true, 'daily');
  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.emit_admin_onboarding_digest_daily() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_admin_onboarding_digest_daily() TO service_role;

-- Signup hook. Fail-safe: a digest error can never break signup.
CREATE OR REPLACE FUNCTION public.tg_admin_onboarding_digest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM public.emit_admin_onboarding_digest(NEW.is_test, false, 'threshold');
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS zz_admin_onboarding_digest ON public.profiles;
CREATE TRIGGER zz_admin_onboarding_digest
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_onboarding_digest();

-- OFF -> ON: one single cumulative catch-up digest for the whole OFF period.
CREATE OR REPLACE FUNCTION public.tg_admin_onboarding_digest_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.key = 'flag_admin_onboarding_digest'
     AND COALESCE(OLD.value_num, 0) < 1 AND COALESCE(NEW.value_num, 0) >= 1 THEN
    BEGIN
      PERFORM public.emit_admin_onboarding_digest(false, true, 'catch_up');
      PERFORM public.emit_admin_onboarding_digest(true, true, 'catch_up');
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS zz_admin_onboarding_digest_flag ON public.platform_settings;
CREATE TRIGGER zz_admin_onboarding_digest_flag
AFTER UPDATE OF value_num ON public.platform_settings
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_onboarding_digest_flag();