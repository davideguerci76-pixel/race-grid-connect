-- SCALE-R3 / STEP A — C-4 indexes O-1, O-2, O-3 (SCALE-R2 §6). Output-neutral: no query logic change.
-- ROLLBACK: DROP INDEX IF EXISTS public.matches_request_stale_idx; DROP INDEX IF EXISTS public.engagements_freelancer_status_idx; DROP INDEX IF EXISTS public.requests_env_active_idx;
CREATE INDEX IF NOT EXISTS matches_request_stale_idx ON public.matches (request_id) WHERE stale = false;
CREATE INDEX IF NOT EXISTS engagements_freelancer_status_idx ON public.engagements (freelancer_id, status);
CREATE INDEX IF NOT EXISTS requests_env_active_idx ON public.requests (is_test, is_active) WHERE is_active = true;