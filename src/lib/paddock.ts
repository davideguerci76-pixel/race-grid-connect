// Shared taxonomy for roles / disciplines / durations.
// Values must match the Postgres enums (freelancer_role, discipline, duration_type).
// Labels are display-only; translated variants live in src/i18n/locales/*.json.
import i18n from "@/i18n";


export type DurationType = "full_season" | "race_weekend" | "test_session";
export const DURATIONS: DurationType[] = ["full_season", "race_weekend", "test_session"];

// Kept for backward compat — now loose strings.
export type Discipline = string;
export type FreelancerRole = string;

export type Option = { value: string; label: string };

export const ROLE_OPTIONS: Option[] = [
  { value: "accounting_finance", label: "Accounting / Finance" },
  { value: "assembly_sub_assembly", label: "Assembly / Sub Assembly" },
  { value: "composite_design_engineer", label: "Composite Design Engineer" },
  { value: "composite_staff", label: "Composite Staff" },
  { value: "control_systems_engineer", label: "Control Systems Engineer" },
  { value: "design_engineer", label: "Design Engineer" },
  { value: "driver_management", label: "Driver Management" },
  { value: "electric_vehicles", label: "Electric Vehicles" },
  { value: "electronics_engineer", label: "Electronics Engineer" },
  { value: "engine_powertrain", label: "Engine / Powertrain" },
  { value: "events", label: "Events" },
  { value: "finance", label: "Finance" },
  { value: "hospitality_staff", label: "Hospitality Staff" },
  { value: "inspector_quality_control", label: "Inspector / Quality Control" },
  { value: "it_computer_engineer", label: "IT / Computer Engineer" },
  { value: "logistics", label: "Logistics" },
  { value: "managers", label: "Managers" },
  { value: "marketing", label: "Marketing" },
  { value: "performance_engineer", label: "Performance Engineer" },
  { value: "procurement_buyer", label: "Procurement / Buyer" },
  { value: "production_engineer", label: "Production Engineer" },
  { value: "production_manager", label: "Production Manager" },
  { value: "project_engineer", label: "Project Engineer" },
  { value: "project_planner", label: "Project Planner" },
  { value: "rd_development_engineer", label: "R&D / Development Engineer" },
  { value: "race_mechanics", label: "Race Mechanics" },
  { value: "simulation_engineer", label: "Simulation Engineer" },
  { value: "stores_parts_coordinator", label: "Stores / Parts Coordinator" },
  { value: "technicians", label: "Technicians" },
  { value: "test_engineers", label: "Test Engineers" },
  { value: "track_engineer", label: "Track Engineer" },
  { value: "truck_driver", label: "Truck Driver" },
  { value: "vehicle_dynamics_engineer", label: "Vehicle Dynamics Engineer" },
];

export const DISCIPLINE_OPTIONS: Option[] = [
  { value: "formula_1", label: "Formula 1" },
  { value: "formula_2", label: "Formula 2" },
  { value: "formula_3", label: "Formula 3" },
  { value: "freca", label: "Formula Regional European Championship (FRECA)" },
  { value: "formula_regional_americas", label: "Formula Regional Americas" },
  { value: "formula_regional_japanese", label: "Formula Regional Japanese Championship" },
  { value: "formula_regional_oceania", label: "Formula Regional Oceania" },
  { value: "formula_regional_middle_east", label: "Formula Regional Middle East" },
  { value: "gb3_championship", label: "GB3 Championship" },
  { value: "euroformula_open", label: "Euroformula Open" },
  { value: "f4_italian", label: "Formula 4 Italian Championship" },
  { value: "f4_british", label: "F4 British Championship" },
  { value: "f4_spanish", label: "F4 Spanish Championship" },
  { value: "usf_pro_2000", label: "USF Pro 2000" },
  { value: "usf2000", label: "USF2000" },
  { value: "indycar", label: "IndyCar" },
  { value: "indy_nxt", label: "Indy NXT" },
  { value: "super_formula", label: "Super Formula" },
  { value: "wec_hypercar", label: "WEC (Hypercar)" },
  { value: "lmp2", label: "LMP2" },
  { value: "gt3", label: "GT3" },
  { value: "gt4", label: "GT4" },
  { value: "dtm", label: "DTM" },
  { value: "tcr", label: "TCR" },
  { value: "wrc_rally1", label: "WRC (Rally1)" },
  { value: "rally2", label: "Rally2" },
  { value: "rally3", label: "Rally3" },
  { value: "rally4", label: "Rally4" },
  { value: "rally5", label: "Rally5" },
  { value: "rallycross", label: "Rallycross" },
  { value: "nascar_cup", label: "NASCAR Cup Series" },
  { value: "nascar_xfinity", label: "NASCAR Xfinity Series" },
  { value: "nascar_truck", label: "NASCAR Craftsman Truck Series" },
  { value: "supercars", label: "Supercars Championship" },
  { value: "sprint_cars", label: "Sprint Cars" },
  { value: "midget_cars", label: "Midget Cars" },
  { value: "autocross", label: "Autocross" },
  { value: "karting", label: "Karting" },
  { value: "hillclimb_specials", label: "Hillclimb Specials" },
  { value: "drift_cars", label: "Drift Cars" },
  { value: "trophy_trucks", label: "Trophy Trucks" },
  { value: "dakar_rally", label: "Dakar Rally (T1+, T2, T3, T4, T5)" },
  { value: "other", label: "Other / Not listed" },
];

// Education levels (single-select on the freelancer profile).
export const EDUCATION_OPTIONS: Option[] = [
  { value: "middle_school", label: "Middle School / Secondary" },
  { value: "high_school", label: "High School Diploma" },
  { value: "vocational_motorsport", label: "Vocational Motorsport School" },
  { value: "technical_diploma", label: "Technical / Mechanical Diploma" },
  { value: "bachelor_equivalent", label: "Bachelor Equivalent (experience)" },
  { value: "bachelor", label: "Bachelor's Degree" },
  { value: "master", label: "Master's Degree" },
  { value: "master_motorsport", label: "Master's in Motorsport Engineering" },
  { value: "phd", label: "PhD / Doctorate" },
  { value: "other", label: "Other" },
];

// Experience years options (1..10, then "10+" as value 11, plus "none" = 0).
// value = numeric years used for matching; 11 means "10+" (>= 10) — the recompute compares >= min_years.
export const EXPERIENCE_YEARS_OPTIONS: Option[] = [
  { value: "0", label: "No experience" },
  { value: "1", label: "1 year" },
  { value: "2", label: "2 years" },
  { value: "3", label: "3 years" },
  { value: "4", label: "4 years" },
  { value: "5", label: "5 years" },
  { value: "6", label: "6 years" },
  { value: "7", label: "7 years" },
  { value: "8", label: "8 years" },
  { value: "9", label: "9 years" },
  { value: "10", label: "10 years" },
  { value: "11", label: "10+ years" },
];

export function experienceYearsLabel(years: number | null | undefined): string {
  if (years == null) return "—";
  if (years <= 0) return "No experience";
  if (years >= 11) return "10+ years";
  return `${years} year${years === 1 ? "" : "s"}`;
}

export const MAX_FREELANCER_EXPERIENCES = 5;
export const MAX_REQUEST_EXPERIENCE_REQS = 3;

export type FreelancerExperience = { discipline: string; years: number };
export type RequestExperienceRequirement = { discipline: string; min_years: number; hard: boolean };

// ---- Languages ----
export type LanguageLevel = "basic" | "intermediate" | "advanced" | "fluent" | "native";
export const LANGUAGE_LEVELS: LanguageLevel[] = ["basic", "intermediate", "advanced", "fluent", "native"];
export const LANGUAGE_LEVEL_RANK: Record<LanguageLevel, number> = {
  basic: 1, intermediate: 2, advanced: 3, fluent: 4, native: 5,
};
// Language codes. English fallback labels; translated versions live under "languages.<code>" in locales.
export const LANGUAGE_OPTIONS: Option[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "zh", label: "Mandarin Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
  { value: "other", label: "Other" },
];
export const MAX_FREELANCER_LANGUAGES = 10;
export const MAX_REQUEST_LANGUAGES = 6;

export type FreelancerLanguage = { code: string; level: LanguageLevel; custom?: string };
export type RequestLanguageRequirement = { code: string; level: LanguageLevel; hard: boolean; custom?: string };

const LANGUAGE_MAP = new Map(LANGUAGE_OPTIONS.map((o) => [o.value, o.label]));
export function languageLabel(code: string | null | undefined, custom?: string | null): string {
  if (!code) return "—";
  if (code === "other") return (custom && custom.trim()) || tryTranslate("languages.other") || "Other";
  const t = tryTranslate(`languages.${code}`);
  if (t) return t;
  return LANGUAGE_MAP.get(code) ?? code;
}
export function languageLevelLabel(level: string | null | undefined): string {
  if (!level) return "—";
  const t = tryTranslate(`language_levels.${level}`);
  if (t) return t;
  return level.charAt(0).toUpperCase() + level.slice(1);
}

// Motorsport-specific skills (multi-select in freelancer profile & team requests)
// English labels below are the fallback; translated labels live in src/i18n/locales/*.json under "skills.<value>".
export const SKILL_OPTIONS: Option[] = [
  { value: "chassis_builder", label: "Chassis Builder" },
  { value: "gearbox_specialist", label: "Gearbox Specialist" },
  { value: "engine_builder", label: "Engine Builder" },
  { value: "welder_tig", label: "TIG Welder" },
  { value: "welder_mig", label: "MIG Welder" },
  { value: "lathe_operator", label: "Lathe Operator" },
  { value: "milling_operator", label: "Milling Operator" },
  { value: "cnc_programmer", label: "CNC Programmer" },
  { value: "composite_layup", label: "Composite Lay-up / Autoclave" },
  { value: "carbon_repair", label: "Carbon Fibre Repair" },
  { value: "hydraulics", label: "Hydraulics Specialist" },
  { value: "pneumatics", label: "Pneumatics Specialist" },
  { value: "electrical_wiring", label: "Electrical Harness / Wiring" },
  { value: "electronics_ecu", label: "ECU / Electronics Mapping" },
  { value: "damper_specialist", label: "Damper Rebuild & Setup" },
  { value: "corner_weights_setup", label: "Setup / Corner Weights / Alignment" },
  { value: "tyre_management", label: "Tyre Management" },
  { value: "fuel_systems", label: "Fuel Systems" },
  { value: "brake_specialist", label: "Brake Systems Specialist" },
  { value: "telemetry_analysis", label: "Telemetry Analysis" },
  { value: "data_acquisition", label: "Data Acquisition (MoTeC, Cosworth, Bosch)" },
  { value: "motec_i2", label: "MoTeC i2 Pro" },
  { value: "matlab_simulink", label: "MATLAB / Simulink" },
  { value: "python_data", label: "Python (Data / Automation)" },
  { value: "vehicle_dynamics_sim", label: "Vehicle Dynamics Simulation" },
  { value: "cfd", label: "CFD (Aerodynamics)" },
  { value: "fea", label: "FEA (Structural Analysis)" },
  { value: "catia", label: "CAD - CATIA V5/V6" },
  { value: "solidworks", label: "CAD - SolidWorks" },
  { value: "siemens_nx", label: "CAD - Siemens NX" },
  { value: "autocad", label: "CAD - AutoCAD" },
  { value: "rhino", label: "CAD - Rhino" },
  { value: "office_suite", label: "MS Office / Google Workspace" },
  { value: "logistics_freight", label: "Freight & Motorsport Logistics" },
  { value: "carnet_ata", label: "Carnet ATA / Customs" },
  { value: "hospitality_ops", label: "Hospitality Operations" },
  { value: "team_management", label: "Team Management" },
  { value: "driver_coaching", label: "Driver Coaching" },
  { value: "race_engineering", label: "Race Engineering" },
  { value: "strategy_engineer", label: "Race Strategy" },
  { value: "pit_stop_crew", label: "Pit Stop Crew" },
  { value: "truckie", label: "Truckie / Transporter Driver" },
  { value: "graphics_wrap", label: "Livery / Wrap Application" },
];

// Backward-compat arrays of values.
export const ROLES: string[] = ROLE_OPTIONS.map((o) => o.value);
export const DISCIPLINES: string[] = DISCIPLINE_OPTIONS.map((o) => o.value);
export const SKILLS: string[] = SKILL_OPTIONS.map((o) => o.value);

const SKILL_MAP = new Map(SKILL_OPTIONS.map((o) => [o.value, o.label]));

// Lazy access to i18n so this module stays usable on the server (where the singleton
// may not have translations loaded).
function tryTranslate(key: string): string | null {
  try {
    if (i18n && typeof i18n.t === "function") {
      const has = typeof i18n.exists === "function" ? i18n.exists(key) : true;
      if (!has) return null;
      const out = i18n.t(key);
      if (typeof out === "string" && out && out !== key) return out;
    }
  } catch { /* ignore */ }
  return null;
}

export function skillLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const t = tryTranslate(`skills.${value}`);
  if (t) return t;
  return SKILL_MAP.get(value) ?? value.replace(/_/g, " ");
}

/** Returns SKILL_OPTIONS with labels translated for the current i18n language. */
export function getTranslatedSkillOptions(): Option[] {
  return SKILL_OPTIONS.map((o) => ({ value: o.value, label: skillLabel(o.value) }));
}

const ROLE_MAP = new Map(ROLE_OPTIONS.map((o) => [o.value, o.label]));
const DISCIPLINE_MAP = new Map(DISCIPLINE_OPTIONS.map((o) => [o.value, o.label]));

export function roleLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return ROLE_MAP.get(value) ?? value.replace(/_/g, " ");
}

export function disciplineLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return DISCIPLINE_MAP.get(value) ?? value.replace(/_/g, " ");
}

const EDUCATION_MAP = new Map(EDUCATION_OPTIONS.map((o) => [o.value, o.label]));
export function educationLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return EDUCATION_MAP.get(value) ?? value.replace(/_/g, " ");
}

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

// ---- Dial codes for phone numbers ----
// Common international dial codes; extend as needed.
export const DIAL_CODES: { code: string; label: string }[] = [
  { code: "+1", label: "🇺🇸 +1 (US/CA)" },
  { code: "+7", label: "🇷🇺 +7 (RU/KZ)" },
  { code: "+20", label: "🇪🇬 +20" },
  { code: "+27", label: "🇿🇦 +27" },
  { code: "+30", label: "🇬🇷 +30" },
  { code: "+31", label: "🇳🇱 +31" },
  { code: "+32", label: "🇧🇪 +32" },
  { code: "+33", label: "🇫🇷 +33" },
  { code: "+34", label: "🇪🇸 +34" },
  { code: "+36", label: "🇭🇺 +36" },
  { code: "+39", label: "🇮🇹 +39" },
  { code: "+40", label: "🇷🇴 +40" },
  { code: "+41", label: "🇨🇭 +41" },
  { code: "+43", label: "🇦🇹 +43" },
  { code: "+44", label: "🇬🇧 +44" },
  { code: "+45", label: "🇩🇰 +45" },
  { code: "+46", label: "🇸🇪 +46" },
  { code: "+47", label: "🇳🇴 +47" },
  { code: "+48", label: "🇵🇱 +48" },
  { code: "+49", label: "🇩🇪 +49" },
  { code: "+51", label: "🇵🇪 +51" },
  { code: "+52", label: "🇲🇽 +52" },
  { code: "+53", label: "🇨🇺 +53" },
  { code: "+54", label: "🇦🇷 +54" },
  { code: "+55", label: "🇧🇷 +55" },
  { code: "+56", label: "🇨🇱 +56" },
  { code: "+57", label: "🇨🇴 +57" },
  { code: "+58", label: "🇻🇪 +58" },
  { code: "+60", label: "🇲🇾 +60" },
  { code: "+61", label: "🇦🇺 +61" },
  { code: "+62", label: "🇮🇩 +62" },
  { code: "+63", label: "🇵🇭 +63" },
  { code: "+64", label: "🇳🇿 +64" },
  { code: "+65", label: "🇸🇬 +65" },
  { code: "+66", label: "🇹🇭 +66" },
  { code: "+81", label: "🇯🇵 +81" },
  { code: "+82", label: "🇰🇷 +82" },
  { code: "+84", label: "🇻🇳 +84" },
  { code: "+86", label: "🇨🇳 +86" },
  { code: "+90", label: "🇹🇷 +90" },
  { code: "+91", label: "🇮🇳 +91" },
  { code: "+92", label: "🇵🇰 +92" },
  { code: "+93", label: "🇦🇫 +93" },
  { code: "+94", label: "🇱🇰 +94" },
  { code: "+95", label: "🇲🇲 +95" },
  { code: "+98", label: "🇮🇷 +98" },
  { code: "+212", label: "🇲🇦 +212" },
  { code: "+213", label: "🇩🇿 +213" },
  { code: "+216", label: "🇹🇳 +216" },
  { code: "+218", label: "🇱🇾 +218" },
  { code: "+220", label: "🇬🇲 +220" },
  { code: "+230", label: "🇲🇺 +230" },
  { code: "+234", label: "🇳🇬 +234" },
  { code: "+254", label: "🇰🇪 +254" },
  { code: "+263", label: "🇿🇼 +263" },
  { code: "+351", label: "🇵🇹 +351" },
  { code: "+352", label: "🇱🇺 +352" },
  { code: "+353", label: "🇮🇪 +353" },
  { code: "+354", label: "🇮🇸 +354" },
  { code: "+356", label: "🇲🇹 +356" },
  { code: "+357", label: "🇨🇾 +357" },
  { code: "+358", label: "🇫🇮 +358" },
  { code: "+359", label: "🇧🇬 +359" },
  { code: "+370", label: "🇱🇹 +370" },
  { code: "+371", label: "🇱🇻 +371" },
  { code: "+372", label: "🇪🇪 +372" },
  { code: "+380", label: "🇺🇦 +380" },
  { code: "+385", label: "🇭🇷 +385" },
  { code: "+386", label: "🇸🇮 +386" },
  { code: "+420", label: "🇨🇿 +420" },
  { code: "+421", label: "🇸🇰 +421" },
  { code: "+852", label: "🇭🇰 +852" },
  { code: "+886", label: "🇹🇼 +886" },
  { code: "+960", label: "🇲🇻 +960" },
  { code: "+961", label: "🇱🇧 +961" },
  { code: "+962", label: "🇯🇴 +962" },
  { code: "+964", label: "🇮🇶 +964" },
  { code: "+965", label: "🇰🇼 +965" },
  { code: "+966", label: "🇸🇦 +966" },
  { code: "+968", label: "🇴🇲 +968" },
  { code: "+971", label: "🇦🇪 +971" },
  { code: "+972", label: "🇮🇱 +972" },
  { code: "+973", label: "🇧🇭 +973" },
  { code: "+974", label: "🇶🇦 +974" },
  { code: "+975", label: "🇧🇹 +975" },
  { code: "+976", label: "🇲🇳 +976" },
];
