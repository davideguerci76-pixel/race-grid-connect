# Query Lifecycle, De-confirmations, Negative CV & SOS Call

Scope is large and cross-cutting (DB + engine + UI + notifications). Presenting a plan before touching code.

## 1. Query lifecycle & auto-close

- Add scheduled server helper `close_expired_requests()` (SQL function + cron via `pg_net` → `/api/public/cron/close-requests`):
  - For every `active`/`paused` request where `sim_now() > first_required_day + 1`:
    - If a `confirmed` engagement exists → status stays `filled` (already handled today, no change).
    - Else → set `status = 'completed'`, `is_active = false`. Reuses existing `completed` enum value; UI relabels as **"Completed · Unfilled"** when `status='completed'` AND no confirmed engagement.
- Requests remain in the archive (already the case). Team dashboard list already shows all statuses — add the "Unfilled" pill next to `completed` when there's no confirmed engagement.

## 2. Cancel-within-24h (no penalty)

- New RPC `cancel_engagement(_engagement_id uuid, _reason text)`:
  - Auth: caller must be freelancer or team on the engagement.
  - If `sim_now() - confirmed_at < 24h` **AND** `sim_now() < first_required_day` → **grace cancel**:
    - `engagements.status = 'cancelled'`, `cancellation_kind = 'grace'`.
    - Reopen the request: `requests.status='active'`, `is_active=true`.
    - Notify all freelancers with a still-pending `proposed` engagement on the same request + the top matched freelancers who never got proposed (kind `match_reopened`).
    - If nobody accepts before the auto-close deadline, standard lifecycle closes it as `completed · unfilled`.
- New engagement columns: `confirmed_at timestamptz`, `cancelled_at timestamptz`, `cancelled_by uuid`, `cancellation_kind text` (`grace` | `team_late` | `freelancer_late` | `no_show`), `cancellation_reason text`.

## 3. Late team cancellation (negative CV)

- Same `cancel_engagement` RPC when caller = team AND `sim_now() >= first_required_day` (or > 24h after confirm):
  - `cancellation_kind = 'team_late'`.
  - Free the freelancer's calendar: nothing to delete — `getMyBlockedDates` already derives from active engagements, so cancelled ones stop blocking automatically.
  - Request goes to `completed` (unfilled). No reopen.
- Public team profile shows aggregate CV line derived from `engagements` where `cancellation_kind='team_late'`:
  - `count(*)` and `avg(first_required_day - cancelled_at::date)` days of notice.
  - Added to `teams/$id` public route and team-preview card in match views.

## 4. Late freelancer cancellation (slot protection)

- Same RPC when caller = freelancer AND late:
  - `cancellation_kind = 'freelancer_late'`.
  - Request reopens like case 2 (notify reserves), auto-close still applies.
  - **Slot protection**: `getMyBlockedDates` extended to also include date ranges of engagements with `cancellation_kind in ('freelancer_late','no_show')` — so red/locked days remain on the freelancer's calendar for that window. UI legend gets a third entry: "Locked (cancelled late)".

## 5. SOS Call

- New setting `sos_min_match_pct` (default 75) in `platform_settings` under existing `matching` category → automatically appears in Admin Tokens tab.
- New RPC `trigger_sos_call(_request_id)`:
  - Team-only.
  - Only allowed when `sim_now()::date = first_required_day` AND request is single-race (`duration <> 'full_season'`) AND request is currently unfilled OR was un-filled today via a same-day freelancer cancel.
  - Finds freelancers whose `matches.skills_score >= sos_min_match_pct` for this request, honouring the request's existing location relevance/anchor/radius filter (mandatory-style geo check, always applied for SOS regardless of the request's original relevance setting).
  - Inserts `sos_calls` row + notifications (`sos_call`) to each eligible freelancer.
  - Auto-trigger path: when `cancel_engagement` fires with same-day freelancer cancel on a single-race request, call the same helper server-side.
- New RPC `accept_sos_call(_sos_id)`:
  - First freelancer to accept → creates a `confirmed` engagement (skips propose step), cancels the SOS, notifies team + all other eligible freelancers (`sos_taken`).
- New table `sos_calls (id, request_id, team_id, triggered_at, triggered_by, resolved_at, resolved_by_engagement)` + `sos_call_targets` for audit.
- UI: SOS button on `dashboard.requests.$id.matches`, visible only when the eligibility window is open. Confirm modal with the exact copy from the spec. Freelancer notification center + top-of-dashboard banner shows active SOS invites with "Accept now" CTA.
- Immediate negative review path for no-show: on same-day freelancer cancel, unlock a "Rate no-show" action for the team in `dashboard.engagements` that submits a 1-star rating bypassing the double-blind wait (server-side flag `no_show=true` on `submit_rating_v2`).

## 6. Files touched

**Migrations (single migration):**
- Add columns to `engagements` (`confirmed_at`, `cancelled_at`, `cancelled_by`, `cancellation_kind`, `cancellation_reason`).
- Add `sos_min_match_pct` setting row.
- Create `sos_calls` + `sos_call_targets` tables with GRANTs, RLS, policies.
- Add enum values to `notif_kind`: `match_reopened`, `sos_call`, `sos_taken`, `engagement_cancelled`.
- New/updated RPCs: `cancel_engagement`, `trigger_sos_call`, `accept_sos_call`, `close_expired_requests`, `team_cancellation_stats(team_id)`, extend `accept_match_confirmation` to stamp `confirmed_at`, extend `submit_rating_v2` for `no_show`.
- Set up cron: `pg_cron` job every 15 min calling `close_expired_requests()`.

**Server functions (`src/lib/paddock.functions.ts`):**
- `cancelEngagement`, `triggerSosCall`, `acceptSosCall`, `getActiveSosForMe`, `getTeamCancellationStats`.
- Extend `getMyBlockedDates` to include locked cancelled ranges (with a `locked` flag per date).
- Extend `getMyEngagements` to expose `confirmed_at`, cancellation state, and "can grace-cancel" / "can late-cancel" flags.

**UI:**
- `dashboard.engagements.tsx`: Cancel button with dynamic copy (grace vs late warning), no-show rate action.
- `dashboard.requests.$id.matches.tsx`: SOS button + confirm modal, "Reopened" banner when applicable.
- `dashboard.requests.index.tsx`: "Unfilled" pill for `completed` without confirmed engagement.
- `dashboard.calendar.tsx` + `availability-calendar.tsx`: extra legend entry, distinguish "engaged" red vs "locked-late" red (same red, different tooltip).
- `teams/$id.tsx`: negative CV line under team header.
- Notification center: render the four new notif kinds with proper CTAs.
- i18n keys added to all 5 locale files.

## 7. Non-goals

- No refunds/token adjustments on cancellations (spec says "zero penali" only for the grace window; no monetary flow specified for late cancels beyond CV).
- SOS not available for `full_season` requests (explicit in spec).
- No changes to matching weights or partial-match logic.
