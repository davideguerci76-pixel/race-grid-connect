# BLACKLIST-02 — Double-blind private blacklist — remediation plan (no implementation)

## 1. Product law as I read it
- Private, directional record (`blocker → blocked`), symmetric effect on pairing: one block in either direction removes the pair from all future pairing.
- Not a rating, not a report, no reputation, no history rewrite, no penalties.
- Exactly two creation entry points: **Cancel (grace)** and **No-show**. Everything else forbidden.
- Counterparty never notified, never able to infer via API/UI. Unblock answers only "removed".
- Management lives in a new **Dashboard Blacklist** page (not Profile): view + remove only.

## 2. Verified authority in the current code
- **Cancel grace**: `cancel_engagement` → `cancel_engagement_internal` (service_role only) requires `status='confirmed'`, actor must be a party, and it computes `cancellation_kind='grace'` when within 24h of `confirmed_at` and before the first covered day (UI mirrors this in `engagement-card.tsx`, `inGrace`). So grace is server-computed, never client-declared. ✔ usable as create authority.
- **No-show**: written by the SOS trigger as `status='cancelled'`, `cancellation_kind='no_show'`, `no_show=true`, on the engagement of the freelancer who did not show. The Engagements page already detects exactly this (`dashboard.engagements.tsx`, `noShowUnilateral`) to offer the unilateral rating to the Team. ✔ usable as create authority and ✔ the right UX anchor — no SOS flow change needed.
- **Matching gates**: candidate admission in `recompute_matches_core` (covers Full/Partial/Coverage/Preview/My Pool/HOT Partial/SOS targets) plus the independent join in `emit_availability_opportunity_notifications`. Re-verified; no third independent candidate universe found. `market_stats()` has its own join but produces only aggregate market statistics with no pairing signal — left untouched. If implementation uncovers a further consumer, STOP and report.

## 3. Data model (minimal)
`public.blocked_pairs`: `id`, `blocker_user_id`, `blocked_user_id`, `source_engagement_id`, `source_kind` (`'cancel_grace' | 'no_show'`), `is_test`, `created_at`. Unique `(blocker_user_id, blocked_user_id)` → idempotent. `source_kind` is the only added field vs BLACKLIST-01, justified by two authorized events and needed for support/audit. No reason text, no counters, no status.
Helper `pair_blocked(a, b)` STABLE: exists in either direction, same environment.

## 4. Authority
- **Create**: `SECURITY DEFINER` RPC only; no client INSERT grant. Checks: authenticated user is a party of a real engagement; grace path requires `cancellation_kind='grace'` and `cancelled_by = auth.uid()`; no-show path requires `cancellation_kind='no_show' AND no_show = true` and `auth.uid() = team_id`. Counterparty and `is_test` derived server-side from the engagement. `ON CONFLICT DO NOTHING`.
- **Read**: RLS `SELECT USING (blocker_user_id = auth.uid())`, grant to `authenticated` only, never `anon`. Dashboard payload built by a server function starting from `source_engagement_id`, reusing the existing redaction logic — no new SELECT authority, no new PII.
- **Delete**: RLS `DELETE USING (blocker_user_id = auth.uid())`; response is `{ok:true}` only; silent enqueue on the existing recompute queue. No endpoint ever answers "is this pair blocked".

## 5. UI touch points
- `src/components/cards/engagement-card.tsx`: optional blacklist step after a grace cancel, and a Blacklist action on the no-show engagement (Team side), next to the existing unilateral-rating slot.
- `src/routes/_authenticated/dashboard.index.tsx`: new `DashCard` (existing component, `Ban`/`ShieldOff` icon) for both Team and Freelancer, placed after Engagements / before Pool; same responsive grid, no new design system.
- New route `src/routes/_authenticated/dashboard.blacklist.tsx`: list of my own blocks (counterpart name already legitimately revealed, source date), remove with confirm dialog, empty state. No search, no manual add.
- i18n keys `blacklist.*` in EN/IT/ES/FR/DE: opportunity title/body (grace + no-show), double-blind reassurance, confirm, dashboard card, list, empty state, remove confirm, success/error.

## 6. Behaviour decisions applied
- My Pool: membership untouched, pair simply not eligible; no count masking.
- Coverage/Preview: real eligible universe, no ghost candidates; no UI text ever attributes a change to a block.
- Future SOS: inherits the core gate, no bypass.
- History, ratings, tokens, lifecycle: untouched.
- Account deletion: rows removed for both blocker and blocked positions inside the existing cleanup; FK cascade to `profiles`, `source_engagement_id` cascade/set null so deletion never blocks. Optional non-user-facing `ops_log_event` entries `BLACKLIST_BLOCK_CREATED/REMOVED` (UUIDs only), existing retention.
- TEST reset/seed and Backup All must include the new table.

## 7. Change inventory
1 migration: table + GRANTs + RLS + `pair_blocked()` + create RPC + delete path + patch of `recompute_matches_core` and `emit_availability_opportunity_notifications` (same `pg_get_functiondef` + replace + `RAISE EXCEPTION` guard pattern as 0149). Server functions in `src/lib/paddock.functions.ts` (or a new `blacklist.functions.ts`). UI: 3 files above + 5 locale files. Regenerate Supabase types.

**Empty-table equivalence**: the gate is a single `AND NOT pair_blocked(...)` predicate; with an empty table it is always true, so matching output is mathematically identical to today.

## 8. Test matrix
Entry points A–H (Team/Freelancer grace with and without block, late cancel and proposed decline forbidden, no-show with/without block, fake no-show rejected) and privacy/matching I–U (one-direction, both directions, dashboard privacy, unblock with and without reverse block, My Pool, Coverage/Preview, HOT Partial, Availability Opportunity, future SOS, RLS/direct attack, account deletion, full regression for non-blocked pairs). All executed in TEST only, with LIVE fingerprint before/after to prove delta zero; no LIVE account creation, no LIVE mutations.

## 9. Rollback
Drop the table and restore the two patched functions from their pre-migration definitions (captured in the migration itself). With no blocks created, rollback is a no-op for matching.

## 10. Risk (updated)
Matching MEDIUM (touches the most critical function, mitigated by empty-table equivalence), lifecycle LOW (read-only on engagements), privacy MEDIUM (accepted Coverage side-channel), security LOW, TEST/LIVE isolation LOW, demo LOW-MEDIUM (it adds a visible dashboard entry and a step in the cancel flow). Effort: core MEDIUM, full hardening LARGE — dominated by the regression matrix.

## 11. Blocking issues
None. Both entry points map to authority that already exists server-side; no product law gap remains.

## Recommendation
**PROCEED AFTER DEMO** — technically the remediation is safe (single predicate, no-op on an empty table), but it patches `recompute_matches_core`, the function every pairing surface depends on, and PASS requires the full U-series regression. That verification window, not the demo date, is the reason to sequence it after Misano.
