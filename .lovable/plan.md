# Zero-Match Refund Policy, Hard Skill Penalty, and the Strategic Trivio

## 1. Admin settings (Tokens tab)

Add two rows in `platform_settings` (category = `refunds`, new section in the admin panel):

- `refund_min_pct` — minimum guaranteed refund. Default `20`, range 0–50 (%).
- `refund_hard_penalty_pct` — refund drop per active hard filter. Default `10` (%).

Formula (server-authoritative):
```
hard_count = (role_hard?1:0)
           + (travel_required?1:0)
           + count(skills_hard)
           + count(experience_requirements where hard=true)
           + count(languages where hard=true)
           + (location_relevance = 'mandatory' ? 1 : 0)
           + (education has entries ? 1 : 0)   // treated as hard when specified
refund_pct = max(refund_min_pct, 100 - hard_count * refund_hard_penalty_pct)
```

Applies to tokens spent to post the request (`cost_request_single` / `cost_request_full_season`, from the actual `token_transactions` entries with `reason='request_post'` and `ref_id=request_id`).

## 2. Trivio panel on the matches page

Trigger: `request.status='active'`, `total_matches = 0`, no confirmed engagement. Rendered above the empty-state on `dashboard.requests.$id.matches.tsx`.

Three options:

**A. Keep searching (wait).** No-op. Request stays active. When `recompute_matches` later produces a full match, the existing `new_matches` notification fires — no code change beyond a notification kind already present. No refund.

**B. Take refund & close.** Calls RPC `refund_and_close_request(_request_id, _mode='full')`:
- Verifies zero full matches and no confirmed engagement.
- Reads spent tokens for that request, computes refund with formula above.
- Credits tokens via `credit_tokens(reason='refund')`.
- Sets `requests.status='completed'`, `is_active=false`, `refund_pct`, `refund_tokens`, `refund_kind='full'`.

**C. Unlock partials (half refund now).** Calls `refund_and_close_request(_request_id, _mode='partial')`:
- Requires `total_partial_matches > 0`.
- Credits `round(refund_full / 2)` (min 1 if refund_full > 0).
- Marks `requests.partial_refund_taken=true`, `refund_kind='partial'`, keeps request `active` so team can browse partial tiers.
- On subsequent confirmation of a FULL match for this request → no further refund. Already covered by not calling refund again.
- On confirmation of a PARTIAL match → no further refund.
- If request later auto-closes as unfilled → no additional refund (partial was already collected).

New columns on `requests`: `refund_pct numeric`, `refund_tokens int`, `refund_kind text` (`full`|`partial`|null), `partial_refund_taken bool default false`.

## 3. Server function + UI

`src/lib/paddock.functions.ts`:
- `getRefundQuote(request_id)` — returns `{spent, hard_count, refund_pct, refund_full, refund_partial, has_partials}` (server-only helper computing hard_count from the DB row).
- `refundAndCloseRequest({request_id, mode})` — wraps the RPC.

`getRequestMatches` extends its return with `refund_quote` and `refund_state` so the page renders the trivio without a second round-trip.

`dashboard.requests.$id.matches.tsx`:
- Above empty state, when `total_matches === 0 && !partial_refund_taken`, render a 3-column trivio panel. Show computed refund %, tokens, and hard-filter breakdown.
- When `partial_refund_taken`, show a small banner "Partial refund collected — X tokens" and hide the trivio.

## 4. i18n

Add keys under `requests.zeroMatch.*` in all 5 locale files (wait/refund/partial titles + descriptions + toast strings).

## 5. Files touched

- **Migration**: two new settings rows, four new columns on `requests`, new RPC `refund_and_close_request(uuid, text)`.
- `src/lib/paddock.functions.ts` — add `getRefundQuote`, `refundAndCloseRequest`; extend `getRequestMatches`.
- `src/routes/_authenticated/dashboard.requests.$id.matches.tsx` — trivio panel + wiring.
- `src/routes/_authenticated/admin.tokens.tsx` — add `refunds` category header (auto-appears since categories loop already generic; only need to register in `CATEGORIES` list).
- `src/i18n/locales/*.json` — new strings.

## Non-goals

- No changes to matching engine, weights, or partial-match penalty.
- No monetary refund; token-only.
- Full-season requests behave identically; the formula uses whatever tokens were actually spent on the post.
