// Shared type helpers
export type Discipline = "f1" | "rally" | "wec_gt" | "karting";
export type FreelancerRole = "track_engineer" | "mechanic" | "telemetrist" | "data_analyst" | "tire_specialist" | "chief_mechanic" | "other";
export type DurationType = "full_season" | "race_weekend" | "test_session";

export const DISCIPLINES: Discipline[] = ["f1", "rally", "wec_gt", "karting"];
export const ROLES: FreelancerRole[] = ["track_engineer", "mechanic", "telemetrist", "data_analyst", "tire_specialist", "chief_mechanic", "other"];
export const DURATIONS: DurationType[] = ["full_season", "race_weekend", "test_session"];

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}
