import i18n from "@/i18n";
import { taxonomyFallbackLabel, taxonomyLabel } from "@/lib/taxonomy-registry";
// Motorsport job taxonomy: macro-role (role group) -> sub-roles -> associated skills.
// Macro-role is a binary hard filter in matching. Sub-role (with level) carries the weight.

export type SubRoleLevel = "junior" | "intermediate" | "senior";
export const SUB_ROLE_LEVELS: SubRoleLevel[] = ["junior", "intermediate", "senior"];
export const LEVEL_RANK: Record<SubRoleLevel, number> = { junior: 1, intermediate: 2, senior: 3 };

export function levelLabel(level: string | null | undefined): string {
  if (!level) return "—";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export type SubRoleOption = { value: string; label: string };
export type RoleGroup = {
  value: string;
  label: string;
  subRoles: SubRoleOption[];
  skills: string[];
};

const LICENCE_SKILLS = [
  "licence_car",
  "licence_car_trailer",
  "licence_hgv",
  "licence_hgv_trailer",
  "licence_bus",
  "licence_bus_trailer",
];

export const ROLE_GROUPS: RoleGroup[] = [
  {
    value: "engineering",
    label: "Engineering & Technical",
    subRoles: [
      { value: "design_engineer", label: "Design Engineer" },
      { value: "composite_design_engineer", label: "Composite Design Engineer" },
      { value: "performance_engineer", label: "Performance Engineer" },
      { value: "race_engineer", label: "Race Engineer" },
      { value: "test_engineer", label: "Test Engineer" },
      { value: "simulation_engineer", label: "Simulation Engineer" },
      { value: "vehicle_dynamics_engineer", label: "Vehicle Dynamics Engineer" },
      { value: "electronics_engineer", label: "Electronics Engineer" },
      { value: "control_systems_engineer", label: "Control Systems Engineer" },
      { value: "engine_powertrain", label: "Engine / Powertrain" },
      { value: "electric_vehicles", label: "Electric Vehicles" },
      { value: "rd_development_engineer", label: "R&D / Development Engineer" },
      { value: "production_engineer", label: "Production Engineer" },
      { value: "project_engineer", label: "Project Engineer" },
      { value: "it_computer_engineer", label: "IT / Computer Engineer" },
    ],
    skills: [
      "cfd", "fea", "catia", "solidworks", "siemens_nx", "autocad", "rhino",
      "matlab_simulink", "python_data", "vehicle_dynamics_sim", "telemetry_analysis",
      "data_acquisition", "magneti_marelli_wintax", "bosch_racecon", "motec_i2",
      "cosworth_pi_toolbox", "aim_race_studio", "life_racing_data", "efi_technology",
      "twod_debenel", "electronics_ecu", "race_engineering", "strategy_engineer",
    ],
  },
  {
    value: "mechanics",
    label: "Mechanics & Workshop",
    subRoles: [
      { value: "chief_mechanic", label: "Chief Mechanic" },
      { value: "race_mechanic", label: "Race Mechanic" },
      { value: "assembly_sub_assembly", label: "Assembly / Sub Assembly" },
      { value: "composite_staff", label: "Composite Staff" },
      { value: "technicians", label: "Technicians" },
      { value: "inspector_quality_control", label: "Inspector / Quality Control" },
      { value: "truck_driver", label: "Truck Driver" },
    ],
    skills: [
      "chassis_builder", "gearbox_specialist", "engine_builder", "welder_tig", "welder_mig",
      "lathe_operator", "milling_operator", "cnc_programmer", "composite_layup", "carbon_repair",
      "hydraulics", "pneumatics", "electrical_wiring", "damper_specialist", "corner_weights_setup",
      "tyre_management", "fuel_systems", "brake_specialist", "pit_stop_crew", "graphics_wrap",
      ...LICENCE_SKILLS,
    ],
  },
  {
    value: "logistics",
    label: "Logistics & Transport",
    subRoles: [
      { value: "logistics", label: "Logistics" },
      { value: "stores_parts_coordinator", label: "Stores / Parts Coordinator" },
      { value: "truck_driver", label: "Truck Driver" },
    ],
    skills: ["logistics_freight", "carnet_ata", "truckie", ...LICENCE_SKILLS],
  },
  {
    value: "management_pr",
    label: "Management, PR & Operations",
    subRoles: [
      { value: "team_manager", label: "Team Manager" },
      { value: "manager", label: "Manager" },
      { value: "production_manager", label: "Production Manager" },
      { value: "project_planner", label: "Project Planner" },
      { value: "driver_management", label: "Driver Management" },
      { value: "driver_coach", label: "Driver Coach" },
      { value: "marketing", label: "Marketing" },
      { value: "events", label: "Events" },
      { value: "accounting_finance", label: "Accounting / Finance" },
      { value: "finance", label: "Finance" },
      { value: "procurement_buyer", label: "Procurement / Buyer" },
    ],
    skills: [
      "team_management", "sponsor_management", "contract_negotiation", "sports_regulations",
      "budgeting_cost_control", "event_ops_planning", "public_relations", "crisis_management",
      "logistics_freight", "carnet_ata", "office_suite",
    ],
  },
  {
    value: "hospitality",
    label: "Hospitality & Catering",
    subRoles: [
      { value: "hospitality_manager", label: "Hospitality Manager" },
      { value: "chef_head_cook", label: "Chef / Head Cook" },
      { value: "sous_chef_kitchen_staff", label: "Sous Chef / Kitchen Staff" },
      { value: "waiter_server", label: "Waiter / Server" },
      { value: "barista_bartender", label: "Barista / Bartender" },
      { value: "hospitality_logistics_setup", label: "Hospitality Logistics & Setup" },
    ],
    skills: [
      "hospitality_ops", "food_safety_haccp", "vip_guest_management", "event_setup_teardown",
      "catering_management", "bar_beverage_management", "multilingual_guest_relations", "office_suite",
    ],
  },
  {
    value: "media_content",
    label: "Media, Photography & Content",
    subRoles: [
      { value: "motorsport_photographer", label: "Motorsport Photographer" },
      { value: "videomaker_cinematographer", label: "Videomaker / Cinematographer" },
      { value: "content_creator_social", label: "Content Creator / Social Media Manager" },
      { value: "drone_fpv_pilot", label: "Drone Pilot / FPV Specialist" },
      { value: "video_editor", label: "Video Editor / Post-Producer" },
      { value: "graphic_designer_livery", label: "Graphic Designer / Livery Artist" },
      { value: "press_officer", label: "Press Officer / Media Relations" },
    ],
    skills: [
      "action_trackside_photography", "studio_portrait_photography", "video_production_4k",
      "fpv_drone_piloting", "premiere_davinci_editing", "after_effects_motion",
      "photoshop_lightroom", "social_media_strategy", "press_release_writing",
      "livery_graphic_design", "office_suite",
    ],
  },
  {
    value: "health_performance",
    label: "Health, Performance & Physiotherapy",
    subRoles: [
      { value: "physiotherapist_osteopath", label: "Physiotherapist / Osteopath" },
      { value: "athletic_trainer", label: "Athletic Trainer / Coach" },
      { value: "sports_nutritionist", label: "Sports Nutritionist / Dietitian" },
    ],
    skills: [
      "driver_rehab_prevention", "manual_therapy_massage", "core_neck_training",
      "ergonomic_cockpit_assessment", "biomechanics_testing", "race_nutrition_planning",
    ],
  },
];

const GROUP_MAP = new Map(ROLE_GROUPS.map((g) => [g.value, g]));

export function roleGroupLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const lang = (i18n?.language || "en").split("-")[0];
  return (
    taxonomyLabel("role_group", value, lang) ??
    taxonomyFallbackLabel("role_group", value) ??
    GROUP_MAP.get(value)?.label ??
    value.replace(/_/g, " ")
  );
}

const SUB_ROLE_MAP = new Map<string, string>();
for (const g of ROLE_GROUPS) for (const s of g.subRoles) SUB_ROLE_MAP.set(s.value, s.label);

export function subRoleLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const lang = (i18n?.language || "en").split("-")[0];
  return (
    taxonomyLabel("sub_role", value, lang) ??
    taxonomyFallbackLabel("sub_role", value) ??
    SUB_ROLE_MAP.get(value) ??
    value.replace(/_/g, " ")
  );
}

export function subRolesForGroup(group: string | null | undefined): SubRoleOption[] {
  if (!group) return [];
  return GROUP_MAP.get(group)?.subRoles ?? [];
}

export function skillsForGroup(group: string | null | undefined): string[] {
  if (!group) return [];
  return GROUP_MAP.get(group)?.skills ?? [];
}

export type FreelancerSubRole = { sub_role: string; level: SubRoleLevel };

export function parseSubRoles(value: unknown): FreelancerSubRole[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => v && typeof v === "object" && typeof (v as any).sub_role === "string")
    .map((v: any) => ({
      sub_role: String(v.sub_role),
      level: (SUB_ROLE_LEVELS.includes(v.level) ? v.level : "intermediate") as SubRoleLevel,
    }));
}
