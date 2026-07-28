## Overview
Add end-to-end review contestation: users flag suspicious ratings from the anonymous review list; admins see a dedicated moderation panel with filters and per-rating actions (freeze, delete, approve). Frozen/deleted ratings must be excluded from average and count everywhere.

## 1. Database migration

New enum + columns on `public.ratings`:
- `rating_moderation_status` enum: `active`, `flagged`, `frozen`, `deleted`, `approved`
- Add `moderation_status rating_moderation_status not null default 'active'`
- Add `flag_reason text`, `flagged_by uuid`, `flagged_at timestamptz`, `moderated_by uuid`, `moderated_at timestamptz`, `auto_suspicious boolean not null default false`

New table `public.rating_flags` (allow multiple reports per rating, audit trail):
- `id`, `rating_id → ratings`, `reported_by uuid`, `reason text not null`, `created_at`
- RLS: reporter can insert own; reporter can select own; admins select/delete all
- GRANT insert/select to authenticated; all to service_role

RPCs (SECURITY DEFINER):
- `flag_rating(_rating_id uuid, _reason text) returns void` — validates reason length (10–2000), inserts flag, sets `moderation_status='flagged'`, `flag_reason`, `flagged_by=auth.uid()`, `flagged_at=now()` (only if currently `active`); creates admin notification (or skipped — notifications enum is user-scoped, we'll skip). Any authenticated user may flag.
- `admin_set_rating_moderation(_rating_id uuid, _action text) returns ratings` — admin only via `has_role`; `_action` in `freeze|delete|approve`. Sets status accordingly, `moderated_by/at`. `delete` performs hard `DELETE`.

Update aggregation to exclude non-active-visible ratings:
- Modify `get_user_rating_summary` and `get_anonymous_reviews` to filter `moderation_status IN ('active','approved')` (i.e. exclude `flagged`, `frozen`, `deleted`).
- Also update admin list aggregators via server-fn (adminListFreelancers/Teams already query ratings directly — add same filter).

## 2. Server functions (`src/lib/paddock.functions.ts`)

- `flagRating({ rating_id, reason })` — auth, calls RPC.
- Extend `getAnonymousReviews` to return each row's `id` (already returned via `*` in RPC? currently `get_anonymous_reviews` returns stars/overall/sub/comment/created_at). Update DB function to also return `id` + `moderation_status` so UI can hide/label already-flagged rows and know rating id for reporting.

Admin:
- `adminListRatings({ filter: 'all'|'flagged'|'frozen'|'auto_suspicious' })` — admin only via service role; joins engagement, from/to profiles (display_name, user_type), includes `flag_reason`, `flagged_at`, `moderation_status`, `auto_suspicious`.
- `adminModerateRating({ rating_id, action })` — calls RPC.
- Auto-suspicious flag: compute simply — a rating is auto-suspicious when its `overall` (or stars) is ≤ 2 AND the recipient's average across other active ratings is ≥ 4. Compute this on the fly in `adminListRatings` (mark `auto_suspicious: true` in the returned row).

## 3. UI

### Anonymous reviews (user-facing) — `src/components/anonymous-reviews.tsx`
- For every review row (not owner-mode blocked), add a small "Flag / Contest" button (Flag icon).
- Opens a shadcn `Dialog` with a required `<Textarea>` (min 10 chars) + submit.
- On submit: call `flagRating`, toast success, refetch. If row already has `moderation_status='flagged'`, show a small muted badge "Reported" and disable button.
- Owner-mode dialog: same behavior — the owner can also contest reviews received.

### Admin panel — new route `src/routes/_authenticated/admin.reviews.tsx`
- Add "Reviews" tab in `admin.tsx` tab list.
- Filter chips: All / Flagged / Frozen / Auto-suspicious.
- Table columns: date, engagement (title/id link), from → to (display names + user_type), overall + sub-scores (compact `RatingIcons`), comment excerpt, status badge, flag reason (if any), actions.
- Actions per row: **Freeze**, **Delete** (confirm), **Approve** — call `adminModerateRating`.
- Status badges: `active` (dim), `flagged` (red), `frozen` (yellow), `approved` (green). `deleted` rows are removed (hard delete) so won't appear.

## 4. i18n
Add strings under `reviews.flag_*` and `admin.reviews.*` in all 5 locale files (English + fallbacks; user can localize later).

## 5. Files touched / created
- Migration (new)
- `src/lib/paddock.functions.ts` — add `flagRating`, tweak `getAnonymousReviews` DB call/shape
- `src/lib/admin.functions.ts` — add `adminListRatings`, `adminModerateRating`
- `src/components/anonymous-reviews.tsx` — flag button + dialog
- `src/routes/_authenticated/admin.reviews.tsx` (new)
- `src/routes/_authenticated/admin.tsx` — new tab entry
- 5 locale JSONs — new keys

## Out of scope
- Moderator-only role (uses existing `admin` only).
- Editing rating contents. Only status transitions + hard delete.
- Notification to reviewer when their rating is moderated (can be added later; notif enum lacks kind).
