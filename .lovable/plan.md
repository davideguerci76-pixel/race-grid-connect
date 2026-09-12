# UAT-DOC-01B — Documentation remediation and retest

## Scope
Update only the ACP Wiki, contextual help, public FAQ, related EN/IT/ES/FR/DE copy, and minimal HelpHint placements. No database, matching, lifecycle, token, notification, setting, launch-gate, or other product behavior changes.

## Implementation
1. **Rebuild the ACP Wiki content map**
   - Replace the obsolete authority wording with a dated internal operations-manual statement.
   - Correct calendar/freshness, Full/Partial/relevance/coverage, cancellation, SOS, refunds, My Pool, tokens, unlock/ranking, and ACP inventory.
   - Add concise operational sections for READY to Match, Request Confirmation, taxonomy, notifications, account authority, billing/launch gates, and LIVE/TEST/Internal Demo/Guided Demo separation.
   - Remove Trivio, unlock-partials, obsolete ranking, global Time Machine, stale coverage terminology, and dormant-setting claims.

2. **Remediate contextual help in five languages**
   - Correct `partial_coverage` to the current date rules and `unlock_details` for the My Pool identity exception.
   - Mount `decline_match` beside Decline and `confirm_calendar` beside Confirm availability because they clarify consequential actions without adding clutter.
   - Remove the unused `locked_days` locale entry rather than adding a new tooltip where the calendar already explains protected states visually and in existing text.

3. **Rewrite the public FAQ in five languages**
   - Keep it concise while covering Full/Partial versus relevance, freshness and READY, anonymity/My Pool, Request Confirmation and Ask More Time, current refunds, grace/late cancellation, SOS, and My Pool/Pit Code.
   - Preserve semantic and structural parity across EN/IT/ES/FR/DE with no accidental English fallback.

4. **Differential retest**
   - Verify all DOC-01–DOC-11 remediation targets and DOC-13 wording; leave DOC-12, DOC-14, and DOC-15 parked.
   - Search globally for superseded user-facing phrases and classify technical legacy strings separately.
   - Validate locale key parity, HelpHint keyboard/touch behavior, FAQ rendering, and the project build/type checks.

5. **Evidence and reporting**
   - Capture ten real post-remediation screenshots covering the requested Wiki, FAQ, and HelpHint surfaces, without mockups or product changes.
   - Produce the final UAT-DOC-01B report and updated findings tracker, including explicit UAT-DOC-01A law checks and LIVE-safety confirmation.
   - Stop at `PASS — READY FOR HUAT`, `PASS WITH RESIDUAL DOC FINDINGS`, or `FAIL`; do not declare HUAT passed or start GO/NO-GO.

## Technical details
- Primary files: `src/routes/_authenticated/admin.wiki.tsx`, five `*.help.json` files, five main locale JSON files containing `faq.items`, and only the existing action/calendar components needed to mount approved HelpHint entries.
- Verification uses source searches, locale-structure checks, focused tests/build telemetry, and Playwright against the real preview.
- The final report and screenshots will be saved as user-facing artifacts under `/mnt/documents/uat-doc-01b/`.
