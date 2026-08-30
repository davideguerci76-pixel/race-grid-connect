/**
 * Columns of `freelancer_profiles` readable by authenticated users through the
 * Data API. Precise coordinates (location_lat / location_lng) are intentionally
 * excluded: they stay server-side for matching / SOS / stats, and the owner can
 * read their own via the `my_profile_coords` RPC.
 * `day_rate` / `currency` are likewise excluded: SELECT on those columns is
 * revoked for `anon` / `authenticated`. The owner reads them via the
 * `my_day_rate` RPC, and authorized PITCALL flows read them server-side with
 * the admin client after the existing business-logic gating.
 */
export const FREELANCER_PROFILE_COLUMNS = [
  "user_id",
  "role",
  "headline",
  "disciplines",
  "travels",
  "location",
  "bio",
  "skills",
  "years_experience",
  "updated_at",
  "education",
  "experiences",
  "languages",
  "calendar_last_updated_at",
  "calendar_last_confirmed_at",
  "role_group",
  "sub_roles",
  "location_city",
  "location_region",
  "location_country",
  "location_place_id",
  "pit_code",
  "is_test",
].join(", ");

/** Team profile columns readable by authenticated users (no VAT, no coordinates). */
export const TEAM_PROFILE_COLUMNS =
  "user_id, team_name, initials, team_type, location, primary_discipline, founded_year, size, bio, website, updated_at, location_city, location_region, location_country, location_place_id, is_test";

/** Rate columns, server-side only (admin client, after authorization checks). */
export const FREELANCER_RATE_COLUMNS = "user_id, day_rate, currency";

/** Full profile columns incl. rate — ONLY for authorized server-side reads. */
export const FREELANCER_PROFILE_COLUMNS_WITH_RATE = `${FREELANCER_PROFILE_COLUMNS}, day_rate, currency`;
