// Procedural (non-AI) generator of realistic motorsport test data.
// Pure functions only: no DB, no network. Deterministic when a seed is given.

export type Preset = "small" | "medium" | "large" | "stress";
export type Area = "italy" | "europe" | "worldwide";
export type Density = "sparse" | "normal" | "dense";

export const PRESET_SIZES: Record<Preset, { freelancers: number; teams: number; requests: number }> = {
  small: { freelancers: 10, teams: 3, requests: 5 },
  medium: { freelancers: 30, teams: 8, requests: 15 },
  large: { freelancers: 80, teams: 20, requests: 40 },
  stress: { freelancers: 200, teams: 50, requests: 100 },
};

/** Availability coverage of the next 120 days, per density. */
const DENSITY_COVERAGE: Record<Density, number> = { sparse: 0.15, normal: 0.4, dense: 0.75 };

type City = { city: string; region: string; country: string; lat: number; lng: number };

const ITALY: City[] = [
  { city: "Maranello", region: "Emilia-Romagna", country: "Italy", lat: 44.5297, lng: 10.8683 },
  { city: "Imola", region: "Emilia-Romagna", country: "Italy", lat: 44.3441, lng: 11.7161 },
  { city: "Monza", region: "Lombardia", country: "Italy", lat: 45.5845, lng: 9.2744 },
  { city: "Varano de' Melegari", region: "Emilia-Romagna", country: "Italy", lat: 44.6853, lng: 10.0158 },
  { city: "Misano Adriatico", region: "Emilia-Romagna", country: "Italy", lat: 43.9756, lng: 12.6866 },
  { city: "Vallelunga", region: "Lazio", country: "Italy", lat: 42.1578, lng: 12.3703 },
  { city: "Torino", region: "Piemonte", country: "Italy", lat: 45.0703, lng: 7.6869 },
  { city: "Modena", region: "Emilia-Romagna", country: "Italy", lat: 44.6471, lng: 10.9252 },
];

const EUROPE: City[] = [
  ...ITALY,
  { city: "Silverstone", region: "England", country: "United Kingdom", lat: 52.0733, lng: -1.0147 },
  { city: "Brackley", region: "England", country: "United Kingdom", lat: 52.0322, lng: -1.1467 },
  { city: "Woking", region: "England", country: "United Kingdom", lat: 51.3168, lng: -0.561 },
  { city: "Spa", region: "Wallonia", country: "Belgium", lat: 50.4923, lng: 5.8631 },
  { city: "Hinwil", region: "Zürich", country: "Switzerland", lat: 47.2975, lng: 8.8419 },
  { city: "Barcelona", region: "Catalunya", country: "Spain", lat: 41.3874, lng: 2.1686 },
  { city: "Le Mans", region: "Pays de la Loire", country: "France", lat: 47.9558, lng: 0.2075 },
  { city: "Hockenheim", region: "Baden-Württemberg", country: "Germany", lat: 49.3278, lng: 8.5658 },
  { city: "Spielberg", region: "Steiermark", country: "Austria", lat: 47.2197, lng: 14.7647 },
  { city: "Zandvoort", region: "Noord-Holland", country: "Netherlands", lat: 52.3888, lng: 4.5409 },
];

const WORLD: City[] = [
  ...EUROPE,
  { city: "Indianapolis", region: "Indiana", country: "United States", lat: 39.795, lng: -86.2347 },
  { city: "Charlotte", region: "North Carolina", country: "United States", lat: 35.2271, lng: -80.8431 },
  { city: "São Paulo", region: "São Paulo", country: "Brazil", lat: -23.5505, lng: -46.6333 },
  { city: "Suzuka", region: "Mie", country: "Japan", lat: 34.8431, lng: 136.5407 },
  { city: "Melbourne", region: "Victoria", country: "Australia", lat: -37.8136, lng: 144.9631 },
  { city: "Dubai", region: "Dubai", country: "United Arab Emirates", lat: 25.2048, lng: 55.2708 },
];

export function citiesFor(area: Area): City[] {
  if (area === "italy") return ITALY;
  if (area === "europe") return EUROPE;
  return WORLD;
}

const FIRST = [
  "Luca", "Marco", "Andrea", "Giulia", "Sofia", "Matteo", "James", "Oliver", "Emma", "Sophie",
  "Lucas", "Nils", "Pierre", "Camille", "Diego", "Ana", "Tomas", "Karel", "Hiro", "Yuki",
  "Ethan", "Noah", "Mia", "Ella", "Sara", "Paolo", "Federico", "Elena", "Hannah", "Jonas",
];
const LAST = [
  "Rossi", "Bianchi", "Ferrari", "Conti", "Moretti", "Smith", "Taylor", "Brown", "Wilson", "Clarke",
  "Dubois", "Martin", "Garcia", "Lopez", "Novak", "Svoboda", "Tanaka", "Sato", "Müller", "Schmidt",
  "Andersson", "Jensen", "Kowalski", "Nowak", "Silva", "Costa", "Ricci", "Greco", "Fischer", "Weber",
];

const TEAM_PREFIX = ["Apex", "Vertex", "Redline", "Northgate", "Corsa", "Iron", "Velocity", "Meridian", "Kinetic", "Slipstream", "Grid", "Torque"];
const TEAM_SUFFIX = ["Racing", "Motorsport", "Competizione", "Engineering", "Performance", "Autosport", "Squadra", "Race Team"];

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length)]!;
const pickMany = <T,>(r: () => number, arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(r() * copy.length), 1)[0]!);
  return out;
};
const intBetween = (r: () => number, min: number, max: number) => min + Math.floor(r() * (max - min + 1));

const ROLE_GROUPS = ["engineering", "mechanics", "logistics", "management_pr", "hospitality"] as const;
const SUB_ROLES: Record<string, string[]> = {
  engineering: ["race_engineer", "performance_engineer", "design_engineer", "simulation_engineer", "test_engineer"],
  mechanics: ["race_mechanic", "technicians", "composite_staff", "assembly_sub_assembly"],
  logistics: ["logistics", "stores_parts_coordinator", "truck_driver"],
  management_pr: ["manager", "marketing", "events", "finance"],
  hospitality: ["hospitality_logistics_setup"],
};
const LEVELS = ["junior", "intermediate", "senior"];

export type GeneratedFreelancer = {
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  role_group: string;
  sub_roles: { sub_role: string; level: string }[];
  disciplines: string[];
  skills: string[];
  day_rate: number;
  years_experience: number;
  travels: boolean;
  headline: string;
  bio: string;
  languages: { code: string; level: string }[];
  location: string;
  location_city: string;
  location_region: string;
  location_country: string;
  location_lat: number;
  location_lng: number;
  availability: string[];
};

export type GeneratedTeam = {
  team_name: string;
  display_name: string;
  email: string;
  initials: string;
  team_type: string;
  primary_discipline: string;
  founded_year: number;
  size: string;
  bio: string;
  website: string;
  vat_number: string;
  location: string;
  location_city: string;
  location_region: string;
  location_country: string;
  location_lat: number;
  location_lng: number;
};

export type GeneratedRequest = {
  title: string;
  discipline: string;
  duration: "race_weekend" | "full_season";
  role_group: string;
  sub_role: string;
  sub_role_min_level: string;
  skills: string[];
  skills_hard: string[];
  start_date: string;
  end_date: string;
  season_dates: string[] | null;
  budget_min: number;
  budget_max: number;
  travel_required: boolean;
  notes: string;
  location: string;
  location_city: string;
  location_region: string;
  location_country: string;
  location_lat: number;
  location_lng: number;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (base: Date, n: number) => new Date(base.getTime() + n * 86400000);

export function generateFreelancers(
  count: number,
  area: Area,
  density: Density,
  disciplines: string[],
  skills: string[],
  seed: number,
): GeneratedFreelancer[] {
  const r = rng(seed);
  const cities = citiesFor(area);
  const today = new Date();
  const coverage = DENSITY_COVERAGE[density];
  const out: GeneratedFreelancer[] = [];

  for (let i = 0; i < count; i++) {
    const first = pick(r, FIRST);
    const last = pick(r, LAST);
    const group = pick(r, [...ROLE_GROUPS]);
    const subs = pickMany(r, SUB_ROLES[group] ?? ["technicians"], intBetween(r, 1, 2)).map((s) => ({
      sub_role: s,
      level: pick(r, LEVELS),
    }));
    const c = pick(r, cities);
    const jitter = () => (r() - 0.5) * 0.6;
    const years = intBetween(r, 1, 20);

    const days: string[] = [];
    for (let d = 0; d < 120; d++) if (r() < coverage) days.push(iso(addDays(today, d)));

    out.push({
      first_name: first,
      last_name: last,
      display_name: `${first} ${last}`,
      email: `testlab.f${i}.${Math.floor(r() * 1e9).toString(36)}@testlab.pitcall.net`,
      role_group: group,
      sub_roles: subs,
      disciplines: pickMany(r, disciplines, intBetween(r, 1, 3)),
      skills: pickMany(r, skills, intBetween(r, 3, 8)),
      day_rate: intBetween(r, 18, 90) * 10,
      years_experience: years,
      travels: r() < 0.8,
      headline: `${subs[0]!.level} ${subs[0]!.sub_role.replace(/_/g, " ")} · ${years} yrs paddock experience`,
      bio: `Motorsport professional based in ${c.city}. ${years} seasons across national and international championships, used to tight schedules, long weekends and travelling with the crew.`,
      languages: pickMany(r, ["en", "it", "es", "fr", "de"], intBetween(r, 1, 3)).map((code, idx) => ({
        code,
        level: idx === 0 ? "fluent" : pick(r, ["basic", "intermediate", "advanced"]),
      })),
      location: `${c.city}, ${c.country}`,
      location_city: c.city,
      location_region: c.region,
      location_country: c.country,
      location_lat: c.lat + jitter(),
      location_lng: c.lng + jitter(),
      availability: days,
    });
  }
  return out;
}

export function generateTeams(count: number, area: Area, disciplines: string[], seed: number): GeneratedTeam[] {
  const r = rng(seed + 991);
  const cities = citiesFor(area);
  const out: GeneratedTeam[] = [];
  for (let i = 0; i < count; i++) {
    const name = `${pick(r, TEAM_PREFIX)} ${pick(r, TEAM_SUFFIX)}`;
    const c = pick(r, cities);
    const jitter = () => (r() - 0.5) * 0.4;
    out.push({
      team_name: name,
      display_name: name,
      email: `testlab.t${i}.${Math.floor(r() * 1e9).toString(36)}@testlab.pitcall.net`,
      initials: name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase(),
      team_type: pick(r, ["private_team", "manufacturer", "engineering_company", "service_provider"]),
      primary_discipline: pick(r, disciplines),
      founded_year: intBetween(r, 1972, 2021),
      size: pick(r, ["1-10", "11-50", "51-200", "200+"]),
      bio: `${name} runs full seasons and one-off programmes out of ${c.city}. Small permanent core, expanded with trusted freelancers on event weekends.`,
      website: `https://www.${name.toLowerCase().replace(/[^a-z]/g, "")}.example`,
      vat_number: `TEST${intBetween(r, 10000000, 99999999)}`,
      location: `${c.city}, ${c.country}`,
      location_city: c.city,
      location_region: c.region,
      location_country: c.country,
      location_lat: c.lat + jitter(),
      location_lng: c.lng + jitter(),
    });
  }
  return out;
}

export function generateRequests(
  count: number,
  area: Area,
  disciplines: string[],
  skills: string[],
  seed: number,
): GeneratedRequest[] {
  const r = rng(seed + 4242);
  const cities = citiesFor(area);
  const today = new Date();
  const out: GeneratedRequest[] = [];

  for (let i = 0; i < count; i++) {
    const group = pick(r, [...ROLE_GROUPS]);
    const sub = pick(r, SUB_ROLES[group] ?? ["technicians"]);
    const c = pick(r, cities);
    const fullSeason = r() < 0.3;
    const startOffset = intBetween(r, 5, 90);
    const start = addDays(today, startOffset);
    const end = addDays(start, fullSeason ? 90 : intBetween(r, 1, 3));

    let seasonDates: string[] | null = null;
    if (fullSeason) {
      seasonDates = [];
      let cursor = new Date(start);
      for (let e = 0; e < intBetween(r, 3, 6); e++) {
        const len = intBetween(r, 2, 3);
        for (let d = 0; d < len; d++) seasonDates.push(iso(addDays(cursor, d)));
        cursor = addDays(cursor, len + intBetween(r, 10, 25));
      }
      seasonDates = Array.from(new Set(seasonDates)).sort();
    }

    const budgetMin = intBetween(r, 20, 60) * 10;
    const chosenSkills = pickMany(r, skills, intBetween(r, 2, 5));

    out.push({
      title: `${sub.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())} — ${c.city} programme`,
      discipline: pick(r, disciplines),
      duration: fullSeason ? "full_season" : "race_weekend",
      role_group: group,
      sub_role: sub,
      sub_role_min_level: pick(r, LEVELS),
      skills: chosenSkills,
      skills_hard: r() < 0.4 ? chosenSkills.slice(0, 1) : [],
      start_date: seasonDates ? seasonDates[0]! : iso(start),
      end_date: seasonDates ? seasonDates[seasonDates.length - 1]! : iso(end),
      season_dates: seasonDates,
      budget_min: budgetMin,
      budget_max: budgetMin + intBetween(r, 5, 40) * 10,
      travel_required: r() < 0.7,
      notes: "Generated by Testing Lab — synthetic Pit Call for QA and demo purposes.",
      location: `${c.city}, ${c.country}`,
      location_city: c.city,
      location_region: c.region,
      location_country: c.country,
      location_lat: c.lat,
      location_lng: c.lng,
    });
  }
  return out;
}
