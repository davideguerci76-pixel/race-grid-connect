-- lovable-cron-fallback-reviewed: 1440 runs/day; required for the 5-minute post-review activation window
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS initial_match_potential text,
  ADD COLUMN IF NOT EXISTS match_potential_current text,
  ADD COLUMN IF NOT EXISTS review_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

CREATE INDEX IF NOT EXISTS requests_pending_review_idx
  ON public.requests (review_deadline_at)
  WHERE status = 'pending_review';

CREATE OR REPLACE FUNCTION public.tg_protect_initial_match_potential()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF OLD.initial_match_potential IS NOT NULL
     AND NEW.initial_match_potential IS DISTINCT FROM OLD.initial_match_potential THEN
    RAISE EXCEPTION 'initial_match_potential is immutable once set';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS requests_protect_initial_match_potential ON public.requests;
CREATE TRIGGER requests_protect_initial_match_potential
  BEFORE UPDATE ON public.requests
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_protect_initial_match_potential();

CREATE OR REPLACE FUNCTION public.classify_match_potential(_match_count integer)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE
    WHEN COALESCE(_match_count, 0) >= COALESCE((SELECT value_num FROM public.platform_settings WHERE key = 'strong_match_threshold'), 5)
      THEN 'strong'
    WHEN COALESCE(_match_count, 0) > 0 THEN 'targeted'
    ELSE 'red'
  END;
$function$;

REVOKE ALL ON FUNCTION public.classify_match_potential(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classify_match_potential(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.activate_request_if_due(_request_id uuid)
RETURNS public.requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.requests%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text, 1));
  SELECT * INTO _row FROM public.requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR _row.team_id <> _uid THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _row.status = 'pending_review' AND _row.review_deadline_at IS NOT NULL AND now() >= _row.review_deadline_at THEN
    UPDATE public.requests
       SET status = 'active', is_active = true, activated_at = COALESCE(activated_at, now()), updated_at = now()
     WHERE id = _request_id
     RETURNING * INTO _row;
  END IF;
  RETURN _row;
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_request_if_due(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_request_if_due(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auto_activate_pending_reviews_env(_is_test boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _row record;
  _count integer := 0;
BEGIN
  FOR _row IN
    SELECT id FROM public.requests
    WHERE status = 'pending_review'
      AND is_test = _is_test
      AND review_deadline_at IS NOT NULL
      AND review_deadline_at <= now()
    ORDER BY review_deadline_at
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.requests
       SET status = 'active', is_active = true, activated_at = COALESCE(activated_at, now()), updated_at = now()
     WHERE id = _row.id AND status = 'pending_review';
    IF FOUND THEN _count := _count + 1; END IF;
  END LOOP;
  RETURN _count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_activate_pending_reviews()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.auto_activate_pending_reviews_env(false);
$function$;

REVOKE ALL ON FUNCTION public.auto_activate_pending_reviews_env(boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_activate_pending_reviews() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_activate_pending_reviews_env(boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_activate_pending_reviews() TO service_role;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-activate-pending-reviews') THEN
    PERFORM cron.schedule('auto-activate-pending-reviews', '* * * * *', $cron$SELECT public.auto_activate_pending_reviews();$cron$);
  END IF;
END;
$do$;