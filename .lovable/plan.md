## Goal
Add an **Education** category to freelancer profiles (single-select, multi-language) and add **"Others"** to the Disciplines / Championships list.

## Scope

### 1. New taxonomy: Education levels
Add to `src/lib/paddock.ts`:
- `EDUCATION_OPTIONS: Option[]` covering (from lowest to highest):
  - `middle_school` — Middle School / Secondary
  - `high_school` — High School Diploma
  - `vocational_motorsport` — Vocational Motorsport School (e.g. ACI Sport, Skip Barber, National Motorsport Academy short courses)
  - `technical_diploma` — Technical / Mechanical Diploma (ITS, Perito Meccanico, etc.)
  - `bachelor_equivalent` — Bachelor Equivalent (self-declared experience equal to a bachelor's)
  - `bachelor` — Bachelor's Degree
  - `master` — Master's Degree
  - `master_motorsport` — Master's Degree in Motorsport Engineering (Cranfield, Oxford Brookes, Bologna, UPM, etc.)
  - `phd` — PhD / Doctorate
  - `other` — Other
- `educationLabel()` helper mirroring `roleLabel` / `skillLabel`.

### 2. Add "Others" to Disciplines
Append `{ value: "other", label: "Other / Not listed" }` to `DISCIPLINE_OPTIONS`.

### 3. Database
Migration:
- `ALTER TABLE public.freelancer_profiles ADD COLUMN education text NULL;`
- No enum (kept as free text with app-side whitelist, same pattern as roles/skills which are already loose strings). No RLS change needed — inherits existing policies.
- Regenerated types will expose the new column afterwards.

### 4. UI wiring
- **`src/routes/_authenticated/dashboard.profile.tsx`** (freelancer form): add an Education `<select>` after Skills, bound to the new column. Save via existing `updateFreelancerProfile` server function.
- **`src/lib/paddock.functions.ts`**: extend the freelancer update payload validator + update statement to include `education`.
- **`src/routes/freelancers.$id.tsx`**: show Education line in the header block (e.g. "Bachelor's Degree" below role/location).
- **`src/routes/freelancers.index.tsx`**: no filter for now (keep scope tight — can add later if needed).

### 5. i18n
Add the new strings to all 5 locales (`en`, `it`, `es`, `fr`, `de`) under:
- `education.label` — section title ("Education", "Titolo di studio", "Formación", "Formation", "Ausbildung")
- `education.placeholder` — "Select your education"
- `education.options.*` — one key per education value above
- `discipline.other` — "Other / Not listed" translation

The taxonomy file keeps English labels as fallback; the profile/detail views will prefer the translated key `education.options.<value>` when available (same pattern isn't currently used for roles/disciplines, so to stay consistent we'll render via the English label from `EDUCATION_OPTIONS` for now, and only translate the section title + placeholder). Confirm before I widen translation to all option labels.

## Out of scope
- Matching logic changes (Education won't influence match score).
- Team profile / requests (education is a freelancer attribute only).
- Filtering freelancers by education on the directory.

## Technical notes
- No new enum type → future additions don't require a migration.
- Legacy rows get `education = NULL`; UI shows "—".
