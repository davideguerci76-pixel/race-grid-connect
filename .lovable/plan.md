# PROF-03 remediation plan

## Scope
- Fix the confirmed Profile account-type leak by mapping the stored `freelancer` role to the approved localized Professional label.
- Preserve `user_type='freelancer'`, routes, backend contracts, database objects, and business logic exactly as they are.
- Audit dynamic role render paths across normal-user screens, not only literal source strings.

## Implementation
1. Add or use one presentation-only role label resolver backed by existing translations.
2. Replace any confirmed normal-user raw role rendering with that resolver; leave technical comparisons and Admin-only diagnostics unchanged.
3. Do not submit forms, create accounts, or mutate profile/calendar data.

## Verification
- Render the authenticated Profile in EN, IT, ES, FR, and DE at mobile and desktop sizes.
- Inspect Dashboard, Auth, Calendar, Matching, cards, Pool, Engagements, Saved Contacts, notifications, public profile, header, and settings for dynamic role exposure.
- Confirm the route remains `/freelancers/$id` and the stored/transported role remains `freelancer`.
- Record the root cause, test evidence, justified technical/Admin residuals, and F-PROF-01 status.