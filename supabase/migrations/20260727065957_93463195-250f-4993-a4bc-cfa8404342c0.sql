
-- 1. Enum extensions
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'rating_available';
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'rating_received';
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'rating_unlocked';
ALTER TYPE public.token_reason ADD VALUE IF NOT EXISTS 'rating_bonus';
