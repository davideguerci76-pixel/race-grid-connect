ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_24_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_12_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS extension_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz;

ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'engagement_expiring';
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'engagement_expired';
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'engagement_declined';
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'engagement_more_time';