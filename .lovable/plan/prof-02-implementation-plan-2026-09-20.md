# PROF-02 implementation plan

## Scope
- Replace user-visible Freelancer/Freelance terminology with Professional equivalents across all five languages.
- Preserve every technical identifier, role value, route, database object, and business rule.
- Update public metadata and user-visible email/notification fallback copy where applicable.

## Implementation
1. Use the PROF-01 inventory and a fresh source scan to classify each occurrence as user-facing, admin-technical, or internal.
2. Edit translation values contextually in EN, IT, ES, FR, and DE without renaming translation keys.
3. Edit only genuinely visible hardcoded strings and metadata; map visible backend error text in presentation code if needed.
4. Keep `/freelancers/$id`, `user_type="freelancer"`, identifiers, payloads, and all backend/database files unchanged.

## Verification
- Check signup copy and static role mapping without submitting a signup.
- Exercise representative public and authenticated TEST/DEMO screens at mobile and desktop sizes.
- Confirm token wording remains hidden for the individual user when the visibility flag is OFF.
- Run a residual terminology sweep, classify every remaining occurrence, and record T1–T8 results in the final report.
