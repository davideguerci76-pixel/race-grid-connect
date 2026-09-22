# PROF-04 grammar remediation plan

## Scope
- Review every user-facing sentence containing the approved Professional terminology in EN, IT, ES, FR, and DE.
- Cover translations, hardcoded copy, runtime interpolation/pluralization, email/notification fallbacks, metadata, and the requested product surfaces.
- Preserve all technical identifiers, `user_type='freelancer'`, database behavior, routes, and business rules.

## Implementation
1. Compare the PROF-02 terminology changes with the current source and classify complete sentences by language and runtime surface.
2. Correct only grammatical or contextual defects: number, articles, agreement, verbs, prepositions/cases, and unnatural constructions.
3. Keep translation keys and interpolation placeholders unchanged; use existing pluralization mechanisms where runtime counts require singular/plural forms.
4. Confirm that dynamic account-role rendering continues through the localized presentation mapping introduced by PROF-03.

## Verification
- Run residual language-specific agreement checks across all five locales and visible hardcoded copy.
- Render representative public and authenticated screens in every language on mobile and desktop without submitting forms or mutating data.
- Verify the confirmed Italian sentence renders as “I PROFESSIONISTI ALIMENTANO LA GRIGLIA”.
- Confirm build health, unchanged technical authority, unchanged `/freelancers/$id`, and zero LIVE writes.
- Deliver a report with root cause, error counts per language, changed files, runtime evidence, residual results, and final F-PROF-02 status.
