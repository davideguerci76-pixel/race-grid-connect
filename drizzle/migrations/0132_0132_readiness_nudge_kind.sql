-- UAT-ONBOARD-05 — new notification kind for the Admin readiness nudge.
-- Added in its own migration: a new enum value cannot be referenced in the same transaction that adds it.
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'readiness_nudge';