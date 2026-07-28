# Partial Matches — Engine, Thresholds, Banner, Token Gate

## 1. Admin settings (new rows in `platform_settings`, editable in `/admin/tokens`)

Category `matching` (new):
- `partial_single_max_missing_pct` (default 30) — hard cutoff on missing-day % for single-race requests.
- `partial_season_max_missing_pct` (default 20) — hard cutoff for full-season requests.
- `partial_single_penalty_per_day` (default 10) — % points subtracted per missing day (single).
- `partial_season_penalty_mode` (default 1) — fixed at "proportional %" (kept as toggle for future).

The existing Tokens tab already renders any setting in `platform_settings`; the new "Matching" category shows up automatically.

## 2. Engine (`recompute_matches`)

- Remove `pass_dates` from hard filters. Compute:
  - `missing_days = required_days - overlap_days` (0 for full match)
  - `missing_pct = missing_days / required_days * 100`
  - `is_full_season = (request.duration = 'full_season')`
- Apply the corresponding admin threshold; drop the row when `missing_pct` exceeds it.
- New per-match columns on `public.matches`:
  - `missing_days int`
  - `missing_pct numeric`
  - `is_partial boolean` (`missing_days > 0`)
  - `edge_only boolean` — true when every missing day sits at the very start or very end of the required window (color = yellow); false when at least one gap is in the middle (red).
  - `skills_score numeric` — pure skill/role/discipline/etc affinity (existing `match_score` logic, unchanged from today).
  - `final_score numeric` — `skills_score` minus the time penalty:
    - Single: `skills_score − partial_single_penalty_per_day * missing_days`
    - Season: `skills_score − missing_pct`
- Ranking (`unlock_match_for_team`, tier gating, `getRequestMatches` sort) switches from `match_score` to `final_score` (tiebreak by `created_at`). This is the only sort key change.

## 3. Display rules

- The card keeps showing **`skills_score`%** as "affinity". `final_score` is used only for ordering, so a stronger-skills / more-missing-days candidate can visually appear below a weaker-skills / fewer-missing-days one.
- Partial cards show:
  - `missing_days` count and a colored dot (yellow = edges only, red = middle gap) with tooltip.
  - Same blurred/gated preview as regular tier 2/3 cards (skills visible, name/contact hidden until unlock).

## 4. FOMO / service banner (below the "full matches" section on `/dashboard/requests/$id/matches`)

Compute:
- `bestFullSkill` = max `skills_score` across matches with `is_partial = false`.
- `bestPartialSkill` = max `skills_score` across `is_partial = true`.

Banner text:
- Case A (`bestPartialSkill > bestFullSkill`): *"Your top matches are at X%, but there are partial matches with Y% affinity (with some missing days). Want to see them?"*
- Case B (otherwise, when partials exist): *"Looking for more options with flexible dates? Check other professionals with partial availability and evaluate their missing days."*
- Hidden when no partials survive the threshold.

Clicking the banner scrolls to / expands a dedicated "Partial matches" section.

## 5. Partial-matches token gate

Partials get their own tiered pagination, mirroring the full-matches architecture already in place:
- Ranks 1–3 → free technical preview.
- Ranks 4–10 → blurred, `cost_unlock_match_for_team` per profile.
- Ranks 11–20 → tier 2 entry, proportional to real partial count vs `tier2_size`, nearest-integer rounding, min 1 token.
- Ranks 21–50 → tier 3 entry, same proportional rule; hard-capped at `hard_cap_matches`.

Implementation: extend `request_tier_unlocks.tier` to accept `12` / `13` (partial-tier 2 / 3) OR add a `scope` column (`full` | `partial`). Chosen approach: **add `scope text not null default 'full'` on `request_tier_unlocks` and `match_unlocks`** and thread it through `unlock_request_tier(_request_id, _tier, _scope)` and `unlock_match_for_team(_match_id)` (scope inferred from the match's `is_partial`). Tokens tab labels stay the same — proportional cost message auto-adapts.

## 6. Files touched

Migration:
- Add matching settings rows.
- Add columns on `matches` (`missing_days`, `missing_pct`, `is_partial`, `edge_only`, `skills_score`, `final_score`).
- Add `scope` on `request_tier_unlocks` and `match_unlocks` (default `'full'`, primary/unique keys updated to include scope).
- Rewrite `recompute_matches` to keep partials, compute penalties, edge detection, and both scores.
- Update `unlock_match_for_team` and `unlock_request_tier` to accept/handle scope with proportional rounding (already nearest-integer).

Server functions (`src/lib/paddock.functions.ts`):
- `getRequestMatches` returns two parallel tier lists (`full`, `partial`) with proportional costs, banner payload (`bestFullSkill`, `bestPartialSkill`), and per-row `missing_days` / `edge_only` / `skills_score`.
- `unlockRequestTier` / `unlockMatch` pass scope.

UI (`src/routes/_authenticated/dashboard.requests.$id.matches.tsx`):
- Render full-match tiers exactly as today (uses `skills_score` for the % badge, ordered by `final_score`).
- New "Partial matches" section with the same tiered UI + yellow/red day-gap indicator.
- FOMO banner between the two sections with dynamic Case A / Case B text.

Admin (`/admin/tokens`): automatically lists the new "Matching" category — no extra UI code required.

## 7. Non-goals / kept as-is

- Weight sliders in `matching_weights` unchanged.
- Wording stays "match" (no "recruitment" / "contract").
- Names/contacts remain hidden until confirmation, per existing rules.
