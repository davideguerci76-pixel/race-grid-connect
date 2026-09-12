# UAT-TEAM-DEMO-01A — Real UI fidelity and first-use dashboard

## Goal
Keep the approved guided-demo logic fully synthetic and deterministic, while making its creation phase visually match the real New Pit Call experience. After a Team completes the demo once, replace the prominent dashboard banner with a discreet replay entry.

## Implementation

1. **Reusable real-create presentation**
   - Extract or introduce focused presentational controls that mirror the real New Pit Call composition: live summary, role/sub-role selectors, real date controls/calendar styling, discipline, experience, language, and skill selectors.
   - Keep operational data loading, token balance, request mutation, launch-gate behavior, and navigation exclusively in the real New Pit Call route.
   - Preserve existing defaults so the operational page behaves exactly as before.

2. **Guided demo surface**
   - Recompose the current local state machine inside the real create-page layout.
   - Show compact contextual step guidance and highlight only the active section; keep future sections visibly inactive without covering controls.
   - Preserve all approved values and transitions: Race Engineer, 14–17 October, GT3, 3 years, English, Telemetry Analysis, Preview 6/HIGH, added Corner Weights Setup, Preview 4/TARGETED, local-only post transition, and unchanged synthetic results.
   - Keep Restart and Exit compact and reachable on desktop and mobile.

3. **Results card presentation mode**
   - Add an explicit opt-in presentation prop to `CandidateMatchCard` that hides its operational action row.
   - Use it only in Guided Demo; the default remains unchanged for real Match Results and all existing call sites.

4. **Minimal completion authority**
   - Add one nullable completion timestamp to the Team-owned profile record.
   - Permit only the authenticated owning Team to set its own timestamp, with an update rule that cannot revert a completed state.
   - Read it with the existing dashboard Team profile query and mark it only upon entering the final screen after the expected guided path.
   - Persist no demo selections, dates, candidates, progress, match data, or lifecycle data.

5. **Dashboard behavior**
   - Before completion: retain the approved prominent Team-only demo banner.
   - After completion: remove that banner and show a small dashboard action card for replay.
   - Freelancer dashboard remains unchanged and receives neither Team demo entry.

6. **Verification**
   - Verify the A–H matrix across Team first-use, guided selections, both previews, result order/copy, completion timing and persistence, replay behavior, Freelancer exclusion, business-data safety, and regression guards.
   - Run focused tests, typecheck/build diagnostics, and browser checks at desktop and mobile sizes.
   - Do not declare Human UAT PASS; report any environment/account limitation explicitly.

## Technical details
- The demo remains client-local except for the single Team completion timestamp.
- No imports or calls to `createRequest`, `modifyRequest`, operational preview/matching, tokens, notifications, Engagement, SOS, TEST, or internal Demo Mode are introduced into the Guided Demo.
- The database change includes explicit grants and row-level ownership protection, following current `team_profiles` access patterns.
