-- LIVE-only capacity early-warning state + daily check dispatcher

CREATE TABLE IF NOT EXISTS public.platform_capacity_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_level text NOT NULL DEFAULT 'NORMAL',
  last_notified_level text,
  last_notified_at timestamptz,
  last_checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.platform_capacity_state TO service_role;
ALTER TABLE public.platform_capacity_state ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_capacity_state (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.platform_capacity_counts()
RETURNS TABLE (total_freelancers integer, total_teams integer, active_pit_calls integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::int FROM public.profiles p
      WHERE p.is_test = false AND p.user_type = 'freelancer'),
    (SELECT count(*)::int FROM public.profiles p
      WHERE p.is_test = false AND p.user_type = 'team'),
    (SELECT count(*)::int FROM public.requests r
      WHERE r.is_test = false AND r.status = 'active'
        AND r.is_active = true AND r.activated_at IS NOT NULL);
$$;

REVOKE ALL ON FUNCTION public.platform_capacity_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_capacity_counts() FROM anon;
REVOKE ALL ON FUNCTION public.platform_capacity_counts() FROM authenticated;

CREATE OR REPLACE FUNCTION public.platform_capacity_level(freelancers integer, active_pcs integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  r_f int;
  r_pc int;
  r_wl int;
  worst int;
  idx bigint;
BEGIN
  r_f := CASE WHEN freelancers >= 2000 THEN 4 WHEN freelancers >= 1500 THEN 3 WHEN freelancers >= 1000 THEN 2 ELSE 1 END;
  r_pc := CASE WHEN active_pcs >= 75 THEN 4 WHEN active_pcs >= 50 THEN 3 WHEN active_pcs >= 30 THEN 2 ELSE 1 END;
  idx := freelancers::bigint * active_pcs::bigint;
  r_wl := CASE WHEN idx >= 100000 THEN 4 WHEN idx >= 50000 THEN 3 WHEN idx >= 25000 THEN 2 ELSE 1 END;
  worst := GREATEST(r_f, r_pc, r_wl);
  RETURN CASE worst
    WHEN 4 THEN 'UPGRADE_NOW'
    WHEN 3 THEN 'PLAN_UPGRADE'
    WHEN 2 THEN 'CHECK_CAPACITY'
    ELSE 'NORMAL'
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_platform_capacity_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.email_hook_config%ROWTYPE;
  st public.platform_capacity_state%ROWTYPE;
  f integer; tm integer; pc integer;
  lvl text;
  endpoint text;
BEGIN
  SELECT * INTO cfg FROM public.email_hook_config WHERE id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO st FROM public.platform_capacity_state WHERE id;
  IF NOT FOUND THEN
    INSERT INTO public.platform_capacity_state (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
    SELECT * INTO st FROM public.platform_capacity_state WHERE id;
  END IF;

  SELECT c.total_freelancers, c.total_teams, c.active_pit_calls
    INTO f, tm, pc
  FROM public.platform_capacity_counts() c;

  lvl := public.platform_capacity_level(f, pc);

  UPDATE public.platform_capacity_state
     SET last_checked_at = now(), updated_at = now()
   WHERE id;

  IF lvl IS NOT DISTINCT FROM st.last_level THEN
    RETURN;
  END IF;

  endpoint := replace(cfg.endpoint, '/api/public/notification-email', '/api/public/capacity-alert');

  PERFORM net.http_post(
    url := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', cfg.secret),
    body := '{}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch_platform_capacity_check failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_platform_capacity_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_platform_capacity_check() FROM anon;
REVOKE ALL ON FUNCTION public.dispatch_platform_capacity_check() FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'platform-capacity-daily-check') THEN
    PERFORM cron.unschedule('platform-capacity-daily-check');
  END IF;
  PERFORM cron.schedule(
    'platform-capacity-daily-check',
    '10 6 * * *',
    $cron$ SELECT public.dispatch_platform_capacity_check(); $cron$
  );
END $$;
