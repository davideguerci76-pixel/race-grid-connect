# STEP 9 — HOT Partial / missing dates recovery

## Outcome
Add a Freelancer-facing HOT Partial path for already-valid Partial Matches on ACTIVE Pit Calls. The path only explains the exact missing Required Days and routes the Freelancer to the existing availability calendar; normal recompute remains the only mechanism that can change matching state.

## Implementation
1. **Database authority and dedup**
   - Add a forward-only migration with a server-authoritative HOT Partial state keyed by request + freelancer + normalized missing-day fingerprint.
   - Derive Required Days through `request_required_days(request_id)` and covered days through the same availability validity and engagement-blocking helpers used by `recompute_matches()`.
   - Gate notifications to ACTIVE, activated, non-stale Partial matches in the same TEST/LIVE environment; keep `pending_review`, closed/cancelled, professional-incompatible, Full and protected states silent.
   - Persist actionable state and use an advisory lock/upsert so identical request/freelancer/missing-day combinations do not notify repeatedly. A real missing-day change creates the next actionable state; resolved states become non-actionable.
   - Reuse existing notification delivery and the Step 5 recompute queue; do not alter scoring, matching, Full/Partial semantics, or introduce HOT RED.

2. **Server functions and Notification Center**
   - Add an authenticated Freelancer-only read/function path for HOT Partial details if needed, without exposing Team identity or aggregate match data.
   - Extend existing notification target/body handling and localized copy for a HOT Partial event. Include only request-safe anonymous context, exact missing ISO dates, and a calendar month/period.
   - Keep individual read behavior from Step 8 and route the CTA to `/dashboard/calendar?m=YYYY-MM`.

3. **Calendar CTA and highlighting**
   - Preserve current calendar protections and mutations. Accept a validated month and missing-day search parameter, open the relevant month, and visually emphasize the supplied missing days without changing availability.
   - No automatic calendar writes; existing availability mutations continue to enqueue normal recompute.

4. **TEST-only verification**
   - Exercise ordinary and sparse-season Required Days, Full/professional mismatch, pending review, closed/cancelled, active Partial, exact notification payload/anonymity, CTA month/highlight, no auto-write, queue/recompute, Partial→Full resolution, dedup and changed missing-day state, protected days, individual read state, and TEST/LIVE isolation.
   - Confirm build/runtime signals and report the requested YES/NO matrix. Stop before Step 10.

## Technical constraints
- Drizzle migrations are authoritative and forward-only.
- Use existing database functions and notification delivery channels.
- All new public tables require explicit grants before RLS/policies.
- No changes to scoring, professional matching, Full/Partial semantics, or Step 1–8 behavior.
