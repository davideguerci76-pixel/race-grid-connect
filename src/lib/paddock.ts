// Shared taxonomy for roles / disciplines / durations.
// Values must match the Postgres enums (freelancer_role, discipline, duration_type).
// Labels are display-only.

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

// Motorsport-specific skills (multi-select in freelancer profile & team requests)
export const SKILL_OPTIONS: Option[] = [
  { value: "chassis_builder", label: "Chassis Builder (Telaista)" },
  { value: "gearbox_specialist", label: "Gearbox Specialist (Cambista)" },
  { value: "engine_builder", label: "Engine Builder (Motorista)" },
  { value: "welder_tig", label: "TIG Welder" },
  { value: "welder_mig", label: "MIG Welder" },
  { value: "lathe_operator", label: "Lathe Operator (Tornitore)" },
  { value: "milling_operator", label: "Milling Operator (Fresatore)" },
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
export function skillLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return SKILL_MAP.get(value) ?? value.replace(/_/g, " ");
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

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}
