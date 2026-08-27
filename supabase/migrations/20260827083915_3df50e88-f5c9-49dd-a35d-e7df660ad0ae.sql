CREATE OR REPLACE FUNCTION public.dispatch_notification_push()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.email_hook_config%ROWTYPE;
  pending integer;
  push_endpoint text;
BEGIN
  SELECT * INTO cfg FROM public.email_hook_config WHERE id;
  IF NOT FOUND THEN RETURN; END IF;

  push_endpoint := replace(cfg.endpoint, '/api/public/notification-email', '/api/public/notification-push');

  SELECT count(*) INTO pending
  FROM public.notifications n
  WHERE n.created_at > now() - interval '2 days'
    AND (
      n.pushed_at IS NULL
      OR EXISTS (
        SELECT 1 FROM public.push_deliveries d
        WHERE d.notification_id = n.id
          AND d.status IN ('pending', 'failed')
          AND d.attempts < 3
      )
    );

  IF pending = 0 THEN RETURN; END IF;

  PERFORM net.http_post(
    url := push_endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', cfg.secret),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_notification_push() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_notification_push() FROM anon;
REVOKE ALL ON FUNCTION public.dispatch_notification_push() FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-notification-push') THEN
    PERFORM cron.unschedule('dispatch-notification-push');
  END IF;
  PERFORM cron.schedule(
    'dispatch-notification-push',
    '* * * * *',
    $cron$ SELECT public.dispatch_notification_push(); $cron$
  );
END $$;