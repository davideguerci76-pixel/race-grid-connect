// DEMO scenarios — declarative manifest types.
// A manifest describes DATA ONLY. All behaviour (matching, notifications,
// engagements, SOS, refunds) is produced by the real PITCALL engine.

export type DemoLangLevel = "basic" | "intermediate" | "advanced" | "fluent" | "native";
export type DemoLevel = "junior" | "intermediate" | "senior";

/**
 * A day is an offset (in days) from the scenario anchor, "today", or an
 * absolute ISO date (YYYY-MM-DD) for scenarios tied to a real championship file.
 */
export type DemoDay = number | "today" | string;

/** A championship round as it appears in the ICS file (all-day, inclusive end). */
export type DemoRound = { label: string; start: string; end: string };

export type DemoText = { it: string; en: string };

export type DemoCity = {
  city: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
};

export type DemoTeam = {
  key: string;
  team_name: string;
  initials: string;
  team_type: string;
  primary_discipline: string;
  founded_year: number;
  size: string;
  city: DemoCity;
  bio: DemoText;
  tokens: number;
  role_in_demo: DemoText;
};

export type DemoFreelancer = {
  key: string;
  first_name: string;
  last_name: string;
  role_group: string;
  sub_roles: { sub_role: string; level: DemoLevel }[];
  disciplines: string[];
  skills: string[];
  languages: { code: string; level: DemoLangLevel }[];
  experiences: { discipline: string; years: number }[];
  day_rate: number;
  years_experience: number;
  travels: boolean;
  city: DemoCity;
  headline: DemoText;
  /** Availability days, as anchor offsets. */
  availability: DemoDay[];
  /** Narrative label shown in the Demo Guide. */
  role_in_demo: DemoText;
  /** Pool membership: team keys this freelancer belongs to. */
  pool_of?: string[];
};

/** A Pit Call the operator creates LIVE in front of the client. */
export type DemoCanonicalPitCall = {
  key: string;
  title: DemoText;
  team: string;
  narrative: DemoText;
  input: {
    role_group: string;
    sub_role: string;
    sub_role_min_level: DemoLevel;
    sub_role_hard: boolean;
    role_hard: boolean;
    discipline: string;
    duration: "race_weekend" | "full_season";
    search_mode: "standard" | "pool";
    days: DemoDay[];
    skills: string[];
    skills_hard: string[];
    languages: { code: string; level: DemoLangLevel; hard: boolean }[];
    budget_min: number;
    budget_max: number;
    travel_required: boolean;
    location: DemoCity;
    location_relevance: "not_relevant" | "relevant" | "mandatory";
    location_radius_km: number;
  };
  /**
   * Season Pit Calls only: the ICS file the operator uploads manually in the
   * Pit Call form. The seeder never imports it; the verifier only checks that
   * the file and the manifest agree on the round days.
   */
  ics?: { filename: string; rounds: DemoRound[] };
  /** Structural assertions verified against the real engine (probe run). */
  expected: {
    full?: string[];
    partial?: string[];
    absent?: string[];
    ranking?: string[];
    min_score?: Record<string, number>;
    max_score?: Record<string, number>;
    /** Personas expected to be visible although below the relevance threshold. */
    visible_below_threshold?: string[];
    /** Season: both Full, but `weaker` must show a lower Professional Relevance than `stronger`. */
    lower_relevance_full?: { weaker: string; stronger: string };
  };
  steps: { it: string; en: string }[];
};

/** State that must exist before the demo starts (created by the seeder only). */
export type DemoPreSeeded = {
  sos: {
    team: string;
    /** Freelancer that confirmed and then pulled out late (no-show narrative). */
    noShowFreelancer: string;
    /** Freelancers that must be SOS-eligible standbys. */
    standby: string[];
    request: {
      title: DemoText;
      role_group: string;
      sub_role: string;
      sub_role_min_level: DemoLevel;
      discipline: string;
      skills: string[];
      budget_min: number;
      budget_max: number;
      location: DemoCity;
      location_radius_km: number;
    };
    steps: { it: string; en: string }[];
  };
  pool: {
    team: string;
    members: string[];
    steps: { it: string; en: string }[];
  };
};

export type DemoScenario = {
  id: string;
  version: string;
  title: DemoText;
  description: DemoText;
  teams: DemoTeam[];
  freelancers: DemoFreelancer[];
  canonicalPitCalls: DemoCanonicalPitCall[];
  preSeeded: DemoPreSeeded;
  /** Availability-opportunity guided flow. */
  availabilityOpportunity: {
    pitCall: string;
    freelancer: string;
    addDays: DemoDay[];
    steps: { it: string; en: string }[];
  };
};
