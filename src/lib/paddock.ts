// Shared type helpers
export type Discipline = string;
export type FreelancerRole = string;
export type DurationType = "full_season" | "race_weekend" | "test_session";

// Full role taxonomy (label -> enum slug)
export const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "accounting_finance", label: "Accounting/Finance" },
  { value: "assembly_sub_assembly", label: "Assembly / Sub Assembly" },
  { value: "composite_design_engineer", label: "Composite Design Engineer" },
  { value: "composite_staff", label: "Composite Staff" },
  { value: "control_systems_engineer", label: "Control Systems Engineer" },
  { value: "design_engineer", label: "Design Engineer" },
  { value: "driver_management", label: "Driver management" },
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
  { value: "stores_parts_coordinator", label: "Stores / Parts coordinator" },
  { value: "technicians", label: "Technicians" },
  { value: "test_engineers", label: "Test Engineers" },
  { value: "track_engineer", label: "Track Engineer" },
  { value: "truck_driver", label: "Truck Driver" },
  { value: "vehicle_dynamics_engineer", label: "Vehicle Dynamics Engineer" },
];

export const DISCIPLINE_OPTIONS: { value: string; label: string }[] = [
  { value: "formula_1", label: "Formula 1" },
  { value: "formula_2", label: "Formula 2" },
  { value: "formula_3", label: "Formula 3" },
  { value: "freca", label: "Formula Regional European Championship by Alpine (FRECA)" },
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
];

export const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.label]));
export const DISCIPLINE_LABELS: Record<string, string> = Object.fromEntries(DISCIPLINE_OPTIONS.map((o) => [o.value, o.label]));

// Legacy label fallbacks so historical mock rows still render nicely
const LEGACY_ROLES: Record<string, string> = {
  mechanic: "Mechanic",
  telemetrist: "Telemetrist",
  data_analyst: "Data Analyst",
  tire_specialist: "Tire Specialist",
  chief_mechanic: "Chief Mechanic",
  other: "Other",
};
const LEGACY_DISCIPLINES: Record<string, string> = {
  f1: "Formula 1",
  rally: "Rally",
  wec_gt: "WEC / GT",
};

export function roleLabel(slug: string | null | undefined): string {
  if (!slug) return "";
  return ROLE_LABELS[slug] ?? LEGACY_ROLES[slug] ?? slug.replace(/_/g, " ");
}
export function disciplineLabel(slug: string | null | undefined): string {
  if (!slug) return "";
  return DISCIPLINE_LABELS[slug] ?? LEGACY_DISCIPLINES[slug] ?? slug.replace(/_/g, " ");
}

export const DURATIONS: DurationType[] = ["full_season", "race_weekend", "test_session"];

// Backwards-compat exports (some legacy pages import these)
export const ROLES: string[] = ROLE_OPTIONS.map((o) => o.value);
export const DISCIPLINES: string[] = DISCIPLINE_OPTIONS.map((o) => o.value);

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}
