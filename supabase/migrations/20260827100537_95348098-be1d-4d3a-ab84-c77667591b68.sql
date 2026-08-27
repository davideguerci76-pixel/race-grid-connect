CREATE TABLE public.client_error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id text NOT NULL,
  category text NOT NULL,
  code text,
  severity text NOT NULL DEFAULT 'error',
  route_pattern text,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_test boolean NOT NULL DEFAULT public.env_is_test(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_error_log_reference_fmt CHECK (reference_id ~ '^PC-[A-Z0-9]{6,10}$'),
  CONSTRAINT client_error_log_severity_chk CHECK (severity IN ('warning','error','fatal')),
  CONSTRAINT client_error_log_category_chk CHECK (category IN (
    'crash','server_error','auth_failure','forbidden','network','pwa','operation_failure'
  )),
  CONSTRAINT client_error_log_code_len CHECK (code IS NULL OR length(code) <= 80),
  CONSTRAINT client_error_log_route_len CHECK (route_pattern IS NULL OR length(route_pattern) <= 200)
);

CREATE UNIQUE INDEX client_error_log_reference_id_key ON public.client_error_log (reference_id);
CREATE INDEX client_error_log_created_idx ON public.client_error_log (created_at DESC);
CREATE INDEX client_error_log_env_created_idx ON public.client_error_log (is_test, created_at DESC);

GRANT INSERT ON public.client_error_log TO anon;
GRANT INSERT, SELECT ON public.client_error_log TO authenticated;
GRANT ALL ON public.client_error_log TO service_role;

ALTER TABLE public.client_error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can report an error"
  ON public.client_error_log FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Admins can read error log"
  ON public.client_error_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.cleanup_client_error_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.client_error_log
  WHERE (is_test = false AND created_at < now() - interval '90 days')
     OR (is_test = true  AND created_at < now() - interval '30 days');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_client_error_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_client_error_log() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-client-error-log')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-client-error-log');
    PERFORM cron.schedule('cleanup-client-error-log', '17 3 * * *', 'SELECT public.cleanup_client_error_log();');
  END IF;
END $$;