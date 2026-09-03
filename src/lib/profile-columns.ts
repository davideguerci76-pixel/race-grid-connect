/**
 * Columns used by authenticated server functions after their business-logic
 * gates. Generic Data API reads are owner-only; these columns exclude precise
 * coordinates, rate fields, and the availability-opportunity mute flag.
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

