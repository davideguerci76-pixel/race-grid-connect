ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
CREATE INDEX IF NOT EXISTS notifications_pending_email_idx
  ON public.notifications (created_at)
  WHERE emailed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.email_hook_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  secret text NOT NULL,
  endpoint text NOT NULL
);

GRANT ALL ON public.email_hook_config TO service_role;
ALTER TABLE public.email_hook_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.email_hook_config (id, secret, endpoint)
VALUES (
  true,
  encode(gen_random_bytes(32), 'hex'),
  'https://project--ba911ff1-05bb-4fd7-8266-392e49d01898.lovable.app/api/public/notification-email'
)
ON CONFLICT (id) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.dispatch_notification_emails()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.email_hook_config%ROWTYPE;
  pending integer;
BEGIN
  SELECT * INTO cfg FROM public.email_hook_config WHERE id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT count(*) INTO pending
  FROM public.notifications
  WHERE emailed_at IS NULL AND created_at > now() - interval '2 days';

  IF pending = 0 THEN RETURN; END IF;

  PERFORM net.http_post(
    url := cfg.endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', cfg.secret),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_notification_emails() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_notification_emails() FROM anon;
REVOKE ALL ON FUNCTION public.dispatch_notification_emails() FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-notification-emails') THEN
    PERFORM cron.unschedule('dispatch-notification-emails');
  END IF;
  PERFORM cron.schedule(
    'dispatch-notification-emails',
    '* * * * *',
    $cron$ SELECT public.dispatch_notification_emails(); $cron$
  );
END $$;