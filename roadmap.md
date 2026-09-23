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

## CANCEL-UX-01 — Cancel Grace UX + cancellation messages
- [x] Audit reason field (reused `cancellation_reason` as public message)
- [x] Migration 0151 private notes + 0152 grant tightening
- [x] PITCALL cancel dialog replaces browser prompt (5 languages)
- [x] Identity persistence after confirmed → cancelled
- [x] TEST matrix A–L, desktop/mobile, LIVE delta zero — PASS WITH FINDINGS
- [x] F-CUX-01: blocked_pairs grants narrowed (migration 0153) — CLOSED/PASS
- [x] CANCEL-UX-02: cancel dialog draft persistence (keyed on engagement id) — CLOSED/PASS

## DEMO-FL-VIDEO-01 — Freelancer onboarding video
- [x] Produce the original desktop reference cut
- [x] Re-record the real PITCALL flow in a native responsive smartphone viewport
- [x] Show touch ripples, vertical gestures, field selection, and calendar date taps without a mouse cursor
- [x] Create the authorized mobile inbox/confirmation simulation
- [x] Edit and verify a 9:16, 60–90 second mobile cut with no token economy or LIVE writes
# PROF-02
- [x] Read PROF-01 audit and inspect current translation/public-copy structure
- [x] Update user-facing terminology in all five languages
- [x] Update visible hardcoded copy, email/notification fallbacks, and public metadata
- [x] Verify technical authority, routing, token visibility, and residual occurrences
- [x] Produce implementation and retest report

## PROF-03 — F-PROF-01
- [x] Replace raw account-role rendering with a localized presentation mapping
- [x] Audit all normal-user dynamic role render paths
- [x] Verify Profile in five languages on mobile and desktop
- [x] Recheck all requested user surfaces without LIVE mutations
- [x] Document root cause, evidence, and final finding status

## DEMO-FL-VIDEO-02 — Professional terminology update
- [x] Audit the approved polished video frame-by-frame for Freelancer/Freelance wording
- [x] Replace every visible legacy term while preserving the approved edit and touch flow
- [x] Render the updated 1080×1920 master and verify zero user-facing residuals

## PROF-04 — F-PROF-02 grammar remediation
- [x] Audit complete Professional terminology sentences across EN/IT/ES/FR/DE
- [x] Correct grammatical regressions in presentation copy only
- [x] Validate representative mobile and desktop runtime surfaces in all five languages
- [x] Complete residual article/agreement sweep and document findings

## SOCIAL-IG-01 — PITCALL Instagram Reel
- [ ] Produce the four-scene 1080×1920 Professional acquisition Reel
- [ ] Verify exact approved copy, safe areas, timing, logo, and zero legacy terminology
- [ ] Deliver the publication-ready MP4 without changing the PITCALL product or LIVE data
