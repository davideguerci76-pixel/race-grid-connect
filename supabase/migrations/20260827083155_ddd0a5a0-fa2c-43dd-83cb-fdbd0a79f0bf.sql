-- 1) Push subscriptions (one row per device/browser endpoint)
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  is_test boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own push subscriptions"
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND is_test = public.env_is_test());

CREATE POLICY "Users insert own push subscriptions"
  ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own push subscriptions"
  ON public.push_subscriptions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- environment is forced server-side, never trusted from the browser
CREATE TRIGGER trg_env_push_subscriptions
  BEFORE INSERT OR UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_inherit_env('user_id');

CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_push_subscriptions_user_env
  ON public.push_subscriptions (user_id, is_test);

-- 2) Per-subscription delivery ledger (idempotency + retry)
CREATE TABLE public.push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_attempt_at timestamptz,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_deliveries_unique_pair UNIQUE (notification_id, subscription_id),
  CONSTRAINT push_deliveries_status_chk CHECK (status IN ('pending','sent','failed','gone'))
);

GRANT ALL ON public.push_deliveries TO service_role;

ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;
-- no policies: backend (service role) only

CREATE TRIGGER trg_push_deliveries_updated_at
  BEFORE UPDATE ON public.push_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_push_deliveries_pending
  ON public.push_deliveries (status, last_attempt_at);

-- 3) Fan-out marker on notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS pushed_at timestamptz;

-- 4) Retention / cleanup for the delivery ledger
CREATE OR REPLACE FUNCTION public.cleanup_push_deliveries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _n integer;
BEGIN
  DELETE FROM public.push_deliveries
  WHERE (is_test AND created_at < now() - interval '7 days')
     OR (status IN ('sent','gone') AND created_at < now() - interval '30 days');
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_push_deliveries() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_push_deliveries() TO service_role;