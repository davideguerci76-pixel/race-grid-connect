# PaddockPro v2 — Match Engine + Tokens + Ratings

## What changes vs v1

- **Language:** switch entire UI to English, add a language switcher (EN default; IT, ES, FR, DE) via `i18next`. All existing pages get translated.
- **New core loop:** freelancers publish **available dates**, teams publish **request dates** (with role/discipline/circuit). A matching engine finds overlaps automatically.
- **Reveals cost tokens:** you always see *how many* matches you have. To see *who* they are (name, contact) you spend 1 token per reveal. Free tokens on signup, buy more in packs.
- **Ratings:** 1–5 stars + comment, both directions, only unlocked after a job is marked **Completed** by both sides.

## New pages / surfaces

```text
/                       Homepage (English, refreshed hero + how-it-works + pricing teaser)
/jobs                   (renamed from /bacheca) Job board with request-date badges
/freelancers            (renamed from /freelance) Directory
/teams                  (renamed from /scuderie) Directory
/freelancers/$id        Public profile — availability calendar visible, contact HIDDEN until revealed
/teams/$id              Public profile — request calendar visible, contact HIDDEN until revealed
/signup                 Two-type registration
/dashboard              Auth landing (redirects to /dashboard/freelance or /dashboard/team)
/dashboard/calendar     Manage own availability / request dates
/dashboard/matches      Match inbox with counts, per-match "Reveal (1 token)" action
/dashboard/tokens       Balance, history, buy packs
/dashboard/jobs         Active/completed engagements, mark as completed, leave rating
/pricing                Token packs
```

## Feature detail

### 1. Availability & request calendars
- Freelancer: month-view calendar, click days to toggle "Available"; each available day carries role + disciplines from profile.
- Team: create a **Request** = role + discipline + circuit + date range + budget. Requests appear on the team calendar.
- Recurring shortcuts: "All race weekends 2026", "Every Sat–Sun".

### 2. Matching engine (server function, runs on write + daily cron)
A match exists when:
- Freelancer's available date overlaps a team's request date range, AND
- Freelancer role matches request role, AND
- Freelancer's disciplines include request discipline, AND
- (optional) Location/travel filter passes.
Match rows are stored with `freelancer_id`, `team_id`, `request_id`, `score`, `revealed_by_freelancer bool`, `revealed_by_team bool`, `created_at`.

### 3. Token economy
- Signup grant: **5 free tokens**.
- Reveal a counterparty = **1 token** (once revealed, permanent for that side).
- Packs: 10 / 50 / 200 tokens via Stripe Checkout. Webhook credits `token_transactions`.
- All balance changes are ledger rows; `profiles.token_balance` is a computed cache updated in the same transaction.

### 4. Notifications
- In-app inbox + email on: new matches count crossing thresholds (1, 5, 10…), someone revealed you, rating received, engagement confirmed.
- Homepage teaser & dashboard banner: *"5 teams match your calendar — reveal them."*

### 5. Ratings
- After a reveal, either party can propose an **Engagement** (dates + fee). Both must confirm.
- After the engagement end date, both sides get a "Mark as completed" button.
- Once **both** mark complete → rating form unlocks for both. 1–5 stars + short comment. Ratings show on public profiles once posted.

## Technical section

### Stack additions
- **Lovable Cloud** (Supabase) for DB, auth, RLS.
- **i18n:** `i18next` + `react-i18next` + `i18next-browser-languagedetector`. Locale in URL search param `?lang=en` and persisted to `localStorage`. All copy moved to `/src/i18n/locales/{en,it,es,fr,de}.json`.
- **Stripe (built-in Lovable Payments)** for token packs.
- **Cron:** Supabase pg_cron nightly job to recompute matches & send digest notifications.

### Data model (new tables)
```text
profiles(id, user_type, display_name, avatar_url, token_balance, created_at)
freelancer_profiles(user_id PK/FK, role, disciplines[], day_rate, travels, location, bio, skills[])
team_profiles(user_id PK/FK, name, initials, type, location, discipline, founded, size, bio)
availability(id, freelancer_id, date, created_at)                       -- one row per available day
requests(id, team_id, role, discipline, circuit, location, start_date, end_date, budget, duration, notes, active)
matches(id, freelancer_id, team_id, request_id, score, revealed_by_freelancer, revealed_by_team, created_at) UNIQUE(freelancer_id, request_id)
token_transactions(id, user_id, delta, reason, ref_id, stripe_session_id, created_at) -- ledger
engagements(id, freelancer_id, team_id, request_id, start_date, end_date, fee, status enum('proposed','confirmed','completed','cancelled'), freelancer_confirmed_completion, team_confirmed_completion)
ratings(id, engagement_id, from_user_id, to_user_id, stars 1-5, comment, created_at) UNIQUE(engagement_id, from_user_id)
notifications(id, user_id, kind, payload jsonb, read_at, created_at)
```
- `user_roles` table + `has_role()` security-definer function per platform rules.
- Full RLS: own-row access for calendars/tokens/notifications; matches visible to both parties but counterparty PII is redacted server-side unless the corresponding `revealed_by_*` flag is true.

### Server functions (`createServerFn` + `requireSupabaseAuth`)
- `setAvailability(dates[])`, `deleteAvailability(dates[])`
- `createRequest(payload)`, `updateRequest`, `deactivateRequest`
- `getMyMatches()` — returns counts + redacted rows
- `revealMatch(match_id)` — atomic: debit token, flip reveal flag, insert notification for counterparty
- `proposeEngagement`, `confirmEngagement`, `markCompleted`
- `submitRating(engagement_id, stars, comment)`
- `createTokenCheckout(pack)` → Stripe Checkout session
- Server route `/api/public/stripe/webhook` — verifies signature, credits tokens via `token_transactions` insert, updates cache.

### Matching computation
Trigger recomputation for the affected freelancer/team on inserts to `availability` and `requests`. Nightly cron re-scans for edge cases (deletions, expired requests).

### UI components
- `<LanguageSwitcher />` in header
- `<AvailabilityCalendar mode="freelancer|team" />` (react-day-picker, multi-select)
- `<MatchCard revealed={bool} onReveal />` with token cost pill
- `<TokenBadge />` in header showing balance
- `<RatingStars value onChange? readOnly? />`
- Rewritten `SiteHeader` / `SiteFooter` using i18n keys

## Migration path

1. Enable Lovable Cloud + configure auth (email/password + Google).
2. Ship migrations + RLS + seed data (replace `src/lib/mock-data.ts`).
3. Add i18n scaffolding and translate all existing v1 pages; rename routes (`bacheca → jobs`, `freelance → freelancers`, `scuderia → teams`).
4. Build calendar, matches, tokens, ratings features in that order.
5. Enable Stripe Payments and wire the token packs + webhook last.

## Open question (blocking Stripe step only)

Where will you be selling the token packs from (country of your business)? This affects whether Stripe full-compliance handling is available (recommended for digital packs) or tax-calc-only. If unsure, I'll default to full compliance handling and you can change it later.

Everything else I'll proceed with defaults: EN first, 5 free tokens, pack sizes 10/50/200, 1 token per reveal, rating unlocks after both sides confirm completion.
