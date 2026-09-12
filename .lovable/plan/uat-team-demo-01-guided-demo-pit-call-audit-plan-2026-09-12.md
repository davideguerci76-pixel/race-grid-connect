# UAT-TEAM-DEMO-01 — Guided Demo Pit Call: audit + plan

Read-only audit done. Nothing was changed.

## A. Wizard components reusable with no side effects

The real Pit Call form (`dashboard.requests.new.tsx`) is one long page, not a multi-step wizard. Its selectors (role, sub-role, discipline, experience, language, skills) are inline markup driven by plain option lists from `src/lib/roles.ts` and `src/lib/paddock.ts` — safe to render again in a demo. The live summary panel (`PitCallSummary`) and the date calendar are presentational too. Everything that writes (`createRequest`, `modifyRequest`, token balance, pool lookup) lives in separate calls we simply will not import.

Caveat: the location field talks to an outside map service. The demo will not include a location step.

## B. Match Results components reusable

The whole card stack is presentational and reads plain objects: `CandidateMatchCard`, the card primitives, and the relevance/coverage signals (Full/Partial label, missing days, relevance %). They can be fed hand-written demo profiles with no database at all. Only the results *page* is tied to a real Pit Call, so we will not reuse the page.

## C. Recommended architecture — dedicated route, client-only state

New route `/dashboard/try-demo` (separate file, own local React state, no persistence). Refreshing restarts the demo. No new tables, no server functions, no DB reads. This is the smallest option and makes the forbidden side effects structurally impossible.

## D. Why "Post demo Pit Call" can never create a real Pit Call

The demo file will not import `createRequest`/`modifyRequest` at all — the button only advances a local step counter. Even a tampered client has nothing to call, and the real creation path stays protected server-side by the existing launch gate and token checks, untouched.

## E. No cron / email / push / token involvement

None of those paths are reachable: they are all triggered by real request/engagement rows, which are never created. No notification row, no token movement, no availability write.

## F. Separation from the internal Demo Mode

The internal Demo Mode (Reset & seed, scenarios A/B/C/D/SOS, TEST dataset, Demo Guide) is admin-only and stays untouched. To avoid confusion the new feature uses its own naming (`trial` / "Try a Demo Pit Call") for the route, files and text keys. No admin access, no TEST access, no seeded data is exposed to Teams.

## G. Taxonomy check — three mismatches with the script

Real values that exist: **Race Engineer** (Engineering → Race Engineer), **English**, experience expressed as a minimum of **3 years**.

Do not exist and must be replaced:
- "GT" → real options are **GT3** and **GT4**. Use GT3.
- "Data Analysis" → use **Telemetry Analysis** (real skill).
- "Car Setup" → use **Setup / Corner Weights / Alignment** (real skill).
- "3+ years" is shown as a minimum-years field, not a "3+" option.

## H. Other differences from the script

- The real form has no "Preview match potential" button: coverage status (HIGH / TARGETED / NO COVERAGE) is only calculated after a Pit Call exists. In the demo the two previews are staged panels we control, styled like the real coverage banner.
- Coverage wording must stay coherent with the real rule: HIGH COVERAGE needs at least 5 matches. So Preview 1 with 6 professionals can say HIGH COVERAGE, Preview 2 with 4 must say TARGETED COVERAGE — which actually strengthens the teaching point.
- The real form is a single page; the demo is genuinely stepped, so it is a new layout reusing the same controls and styling.

## I. Analytics

There is no analytics or event tracking in the product today. Per your instruction not to build a new system, the demo will not add one. If you later want "demo started / completed" counts, that is a separate small step.

## J. Size and risk

**MEDIUM.** No backend work, but there are 9 screens, guided validation, 4 demo profiles and 5 languages of text. Main maintenance risk: if the real selectors or match cards change visually, the demo can drift — mitigated by reusing the real card components instead of copying them.

## K. Implementation plan

1. New route `/dashboard/try-demo` with local state machine: intro → role → dates → requirements → preview 1 → edit requirements → preview 2 → post → results → end.
2. Reuse the real calendar, option lists and match cards; guided hints sit next to each control, Next stays disabled until the requested choice is made.
3. Four synthetic profiles exactly as specified: Alex Morgan Full 100%, James Wilson Partial 94% (missing 17 Oct), Marco Bianchi Full 88%, Pierre Martin Partial 82% (missing 14 Oct), with the three progressive callouts ending on the Partial-94 vs Full-88 comparison.
4. Entry point card on the Team dashboard, prominent while Pit Calls are closed for onboarding, plus permanent Exit and Restart controls.
5. Text in all five languages, new `*.trial.json` files.
6. Verify: whole flow on mobile and desktop, confirm no request/match/notification/token record is created, and confirm the internal Demo Mode and real Pit Call flow are unchanged.

Blockers: none. The only decisions needed from you are the three taxonomy substitutions in section G.
