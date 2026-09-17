- [x] STEP 8: audit and consolidate Team match notifications on the existing notification pipeline
- [x] STEP 8: implement server-authoritative first-match, first-full, STRONG, and aggregated activity events
- [x] STEP 8: preserve pending_review silence, TEST/LIVE isolation, and existing delivery channels
- [x] STEP 8: implement individual Notification Center read state and deep-link routing
- [x] STEP 8: run TEST-only E2E and report the exact requested matrix; stop before STEP 9
- [x] STEP 9: implement HOT Partial missing Required Days recovery without changing matching/scoring
- [x] STEP 9: integrate anonymous Freelancer notification, calendar month/highlight CTA, and dedup
- [x] STEP 9: run TEST-only E2E matrix and confirm TEST/LIVE isolation; stop before STEP 10
- [x] REVIEW03: add the server-side professional relevance threshold authority at 50%
- [x] REVIEW03: validate ACP bounds, persistence, localization, no-consumer scope, and build/runtime state
- [x] REVIEW04: relabel Team-facing Match Potential as coverage without changing internal bands or quantitative semantics
- [x] REVIEW04: verify localized preview/detail/ACP surfaces and preserve notifications, matching, refunds, HOT Partial, pool, and Expand logic
- [x] REVIEW06: remove only new Team STRONG REACHED notification emission; preserve First Match, First Full, aggregate, Notification Center, and all prior business flows
- [x] REVIEW06: verify TEST-only notification invariants, pending-review silence, historical preservation, TEST/LIVE isolation, and zero Project monitoring findings; stop before REVIEW07
- [x] REVIEW07: gate NORMAL HOT Partial eligibility by server-side professional relevance threshold; preserve Pool, matching visibility, exact missing days, anonymity, CTA, dedup, and TEST/LIVE isolation; stop before REVIEW08
- [x] REVIEW09: add Freelancer-owned Availability Opportunities mute preference with server-side enforcement; preserve HOT Partial, reminders, matches, engagements, Team notifications, aggregation, dedup, and TEST/LIVE isolation; stop before REVIEW10
- [x] REVIEW10: preserve Pool behavior and gate Expand by outside-Pool valid Full/Partial matches at the dynamic ACP threshold; verify security, atomicity, and isolation
- [x] REVIEW11.B: owner-only RLS on freelancer_profiles, server-side gated profile reads, and Pool identity behind pool_search_unlocks
- [x] MT-06.R: Post Identical mai rimborsabile (colonna server-authoritative repost_identical)
- [x] MT-06.R: idempotenza server-authoritative del POST (idempotency_key per tentativo)
- [x] MT-06.R: evidenza reale refund low-relevance (70% del refund zero-match)
- [x] UAT-TEAM-DEMO-01A: rebuild Guided Demo creation surface with real Pit Call presentation and contextual guidance
- [x] UAT-TEAM-DEMO-01A: persist one-way Team completion state and switch dashboard banner to discreet replay entry
- [x] UAT-TEAM-DEMO-01A: hide operational match CTA only in Guided Demo and verify A–H regressions
- [x] UAT-DOC-01B: remediate ACP Wiki against current implementation and UAT-DOC-01A
- [x] UAT-DOC-01B: update HelpHint wording and resolve orphan keys with documented MOUNT/REMOVE decisions
- [x] UAT-DOC-01B: update public FAQ in EN/IT/ES/FR/DE with semantic parity
- [x] UAT-DOC-01B: run differential retest, global stale-copy search, build/typecheck validation, and visual evidence
- [x] UAT-DOC-01B: publish final report and findings tracker without product or database changes
- [x] HOME-PREOPEN-01: add the independent ACP pre-opening claim toggle using existing Launch authority
- [x] HOME-PREOPEN-01: localize the existing hero and new pre-opening section in EN/IT/ES/FR/DE
- [x] HOME-PREOPEN-01: preserve the approved Home and verify toggle, responsive, regression, and LIVE Pit Call safety
- [x] HOME-PREOPEN-01A/B: apply the four approved non-English hero claims only
- [x] HOME-PREOPEN-01A/B: control both pre-opening headline wraps across five languages and responsive widths
- [x] HOME-PREOPEN-01A/B: verify language switching, refresh persistence, visual regressions, and zero LIVE changes

## OPS-MON-01 (read-only audit)
- [x] OPS-MON-01: production monitoring & alerting audit report delivered; STOP, awaiting remediation decision

## PRIVACY-UX-01
- [x] Add one identity privacy reassurance to Freelancer and Team signup
- [x] Add one identity privacy reassurance to Freelancer and Team Profile/Onboarding
- [x] Verify EN/IT/ES/FR/DE, responsive layout, anonymity authority, and zero LIVE business changes

## BLACKLIST-02 (double-blind private blacklist)
- [x] Migration 0150: blocked_pairs table, RLS owner-only, create/remove RPC, pair_blocked helper
- [x] Matching gates (recompute_matches_core, availability opportunities) + purge/deletion/backup coverage
- [x] Server functions, Dashboard card, /dashboard/blacklist page, Cancel-grace and no-show entry points
- [x] i18n EN/IT/ES/FR/DE, TEST-only authority/privacy matrix, LIVE fingerprint delta zero
