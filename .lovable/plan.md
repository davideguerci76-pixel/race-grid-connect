## Goal

Rebuild the team-side "matches for a request" view around three hard tiers (1–10, 11–20, 21–50) with per-tier entry fees, per-profile unlock fees, blurred previews, dynamic proportional pricing when a tier is not full, and a hard cap at match #50.

## Tier rules

- **Tier 1 (1–10)** — no entry fee.
  - Ranks 1–3: technical preview visible (score, missing criteria, headline, skills, disciplines, location, day rate, bio, experiences, languages). Names/contacts stay hidden.
  - Ranks 4–10: card blurred, only score + missing criteria visible. Unblur one profile = `cost_unlock_profile` tokens (per profile, standard).
- **Tier 2 (11–20)** — locked behind a one-time entry fee `cost_tier2_entry` (default 5). Once paid, ranks 11–20 become listable in the same "blurred until per-profile unlock" state. Per-profile unblur still costs `cost_unlock_profile`.
- **Tier 3 (21–50)** — locked behind `cost_tier3_entry` (default 25). Same per-profile unlock model. Hard cap at rank 50; anything beyond is discarded server-side.

## Proportional entry pricing

When the total match count `N` falls inside a tier, the entry fee for that tier is scaled by `actual_slots / tier_size`:

- Tier 2 size = 10. If `N < 20`, entry fee = `ceil(cost_tier2_entry * (min(N,20)-10) / 10)`, min 1 token when there is at least 1 slot.
- Tier 3 size = 30. If `N < 50`, entry fee = `ceil(cost_tier3_entry * (min(N,50)-20) / 30)`, min 1 token.
- If a tier has zero real slots (e.g. N ≤ 10 → tier 2/3 empty), the tier is not shown at all.

Same formula runs on the server (charge) and on the client (preview / warning).

## Backend

New migration:
- Add settings rows: `cost_tier2_entry` (5), `cost_tier3_entry` (25), `cost_unlock_profile` (1), `tier2_size` (10), `tier3_size` (30), `hard_cap_matches` (50).
- New table `request_tier_unlocks (id, team_id, request_id, tier smallint check in (2,3), tokens_spent int, unlocked_at)` with unique `(team_id, request_id, tier)`. Standard grants + RLS (team can select/insert own via SECURITY DEFINER rpc).
- New RPC `unlock_request_tier(_request_id uuid, _tier int)`:
  - Verifies caller is `requests.team_id`.
  - Counts real matches for the request, computes proportional cost with the formula above.
  - Debits tokens via `credit_tokens`, inserts unlock row (idempotent — returns current balance if already unlocked).
  - Returns `{ tier, tokens_spent, balance, total_matches }`.
- Update `unlock_match_for_team` to reject matches beyond `hard_cap_matches`, drop the legacy "top 3 free" branch's dependence on rank ≤ 3 only (top 3 stays free through the new preview path, not through `match_unlocks`), and require the correct tier unlock for matches at ranks 11+.

Server functions in `paddock.functions.ts`:
- `getRequestMatches`: cap `rows` at 50, compute tiers, load `request_tier_unlocks` for the caller, gate returned data:
  - Ranks 1–3: return tech preview.
  - Ranks 4–10: return score + missing_criteria + `blurred: true`, no profile fields.
  - Ranks 11–20: only returned if tier2 unlocked; otherwise return a placeholder row `{ blurred: true, tier: 2, locked_tier: true }` per slot.
  - Ranks 21–50: same with tier 3.
  - Add `tiers: [{ tier, size, real_count, entry_cost, unlocked }]` to the payload plus `total_matches` and existing `hired`.
- Add `unlockRequestTier` server fn wrapping the new rpc.
- Add `getTierPricingPreview` (optional) reusing formula — keep it inline in `getRequestMatches` payload to avoid extra round-trips.

## Frontend

`src/routes/_authenticated/dashboard.requests.$id.matches.tsx`:
- Group `data.items` by tier (server already tags each item with `tier` and `rank`).
- Render three sections. Each locked tier shows a call-to-action panel with the proportional entry cost, the "only X real matches in this tier" warning when applicable, and a confirm dialog before spending tokens.
- Blurred cards use `filter blur-sm select-none pointer-events-none` on inner content, with score + missing criteria layered on top; unlock button uses the existing per-profile unlock flow (`unlockMatch`).
- Remove the current pagination controls (replaced by tier sections); keep `hired` block unchanged.
- Copy: warnings match the spec ("Only X real matches in this tier — entry fee reduced proportionally to Y tokens"). English only in code, existing i18n strings unchanged.

## Admin

`src/routes/_authenticated/admin.tokens.tsx` already renders every `platform_settings` row, so the new keys appear automatically once inserted. No code change needed.

## Out of scope

- No changes to freelancer-side match views (`dashboard.matches`) or engagement flow.
- Ratings/moderation, calendar, and Google Maps flows untouched.
- No pricing changes to existing costs — only new keys added.
