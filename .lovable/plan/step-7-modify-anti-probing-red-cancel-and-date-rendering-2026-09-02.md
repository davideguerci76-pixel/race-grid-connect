# STEP 7 — Modify, anti-probing, RED cancel, and date rendering

## Goal
Add the Team-side MODIFY flow during Post Review, keep all matching decisions server-authoritative, support eligible RED cancellation with a full token return, and correct ordinary engagement date labels without changing unrelated matching, Reveal, rating, Pool, or TEST/LIVE rules.

## Implementation
1. Add forward-only migration `0033_step7_modify_and_red_cancel.sql`:
   - add request fields for the current match-potential snapshot and modify/cancel state as needed;
   - add a rolling 24-hour recheck ledger with environment scoping and concurrency-safe locking;
   - implement owner-scoped `modify_request`, using `request_required_days()` and a canonical fingerprint of all matching inputs;
   - count only meaningful changes, enforce the per-Pit-Call and rolling budget settings, recompute matches atomically, update only `match_potential_current`, and preserve immutable `initial_match_potential`;
   - implement eligible RED cancel with `FOR UPDATE`, one-time 100% refund, close/archive semantics, and duplicate/race protection;
   - keep TEST/LIVE isolated and preserve the existing automatic post-review activation behavior.
2. Extend `src/lib/paddock.functions.ts` with validated server functions for Modify, RED cancel, and manual post-review activation, and expose only safe anti-probing metadata to the Team.
3. Update the Team Match Results page with a Modify entry point, post-review Continue/activate action, RED-cancel confirmation and state handling, without exposing raw match counts during review.
4. Fix `PitCallDates` so contiguous dates render as a normal range and only sparse date groups use the Championship label.
5. Add EN/IT/ES/FR/DE strings for controls, limits, budget errors, and RED-cancel confirmation.

## Verification
Run the project’s automated checks, then verify migration syntax, route/build integrity, contiguous vs sparse date rendering, post-review count redaction, owner/role guards, budget limits, duplicate-click safety, full refund idempotency, and TEST/LIVE isolation. Do not modify unrelated business logic or LIVE rows.