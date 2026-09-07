-- LAW 2: saved calendar names must be unique per owner and environment.
-- Server-side auto-suffix resolves collisions; this index makes the rule
-- race-safe under concurrent double submits.
CREATE UNIQUE INDEX IF NOT EXISTS user_calendars_owner_env_name_key
  ON public.user_calendars (owner_id, is_test, name);