
-- 1. Extend token_reason enum
ALTER TYPE public.token_reason ADD VALUE IF NOT EXISTS 'request_post';

-- 2. Add status column to requests
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_status') THEN
    CREATE TYPE public.request_status AS ENUM ('active','paused','closed','completed');
  END IF;
END$$;

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS status public.request_status NOT NULL DEFAULT 'active';
