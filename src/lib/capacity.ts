// Shared, pure capacity-warning logic (safe on client and server).
// This is an EARLY OPERATIONAL WARNING based on LIVE application counters.
// It does not measure infrastructure capacity (RAM, CPU, disk, pool, WAL).

export type CapacityLevel = "NORMAL" | "CHECK_CAPACITY" | "PLAN_UPGRADE" | "UPGRADE_NOW";

export const CAPACITY_LEVEL_ORDER: CapacityLevel[] = [
  "NORMAL",
  "CHECK_CAPACITY",
  "PLAN_UPGRADE",
  "UPGRADE_NOW",
];

export const CAPACITY_THRESHOLDS = {
  freelancers: { check: 1000, plan: 1500, upgrade: 2000 },
  activePitCalls: { check: 30, plan: 50, upgrade: 75 },
  workloadIndex: { check: 25000, plan: 50000, upgrade: 100000 },
} as const;

export function levelRank(level: CapacityLevel): number {
  return CAPACITY_LEVEL_ORDER.indexOf(level);
}

export function levelFor(value: number, t: { check: number; plan: number; upgrade: number }): CapacityLevel {
  if (value >= t.upgrade) return "UPGRADE_NOW";
  if (value >= t.plan) return "PLAN_UPGRADE";
  if (value >= t.check) return "CHECK_CAPACITY";
  return "NORMAL";
}

/** Value that would move this indicator to the next level, or null at the top level. */
export function nextThreshold(
  value: number,
  t: { check: number; plan: number; upgrade: number },
): number | null {
  if (value < t.check) return t.check;
  if (value < t.plan) return t.plan;
  if (value < t.upgrade) return t.upgrade;
  return null;
}

export interface CapacitySnapshot {
  total_freelancers: number;
  total_teams: number;
  active_pit_calls: number;
  workload_index: number;
  freelancer_level: CapacityLevel;
  active_pit_calls_level: CapacityLevel;
  workload_level: CapacityLevel;
  overall_level: CapacityLevel;
  /** Indicators that determine the overall level (worst-indicator wins). */
  driving_indicators: ("freelancers" | "active_pit_calls" | "workload_index")[];
}

export function buildCapacitySnapshot(counts: {
  total_freelancers: number;
  total_teams: number;
  active_pit_calls: number;
}): CapacitySnapshot {
  const workload_index = counts.total_freelancers * counts.active_pit_calls;
  const freelancer_level = levelFor(counts.total_freelancers, CAPACITY_THRESHOLDS.freelancers);
  const active_pit_calls_level = levelFor(counts.active_pit_calls, CAPACITY_THRESHOLDS.activePitCalls);
  const workload_level = levelFor(workload_index, CAPACITY_THRESHOLDS.workloadIndex);

  // Worst indicator wins — never an AND between indicators.
  const worstRank = Math.max(
    levelRank(freelancer_level),
    levelRank(active_pit_calls_level),
    levelRank(workload_level),
  );
  const overall_level = CAPACITY_LEVEL_ORDER[worstRank] as CapacityLevel;

  const driving: CapacitySnapshot["driving_indicators"] = [];
  if (freelancer_level === overall_level && overall_level !== "NORMAL") driving.push("freelancers");
  if (active_pit_calls_level === overall_level && overall_level !== "NORMAL") driving.push("active_pit_calls");
  if (workload_level === overall_level && overall_level !== "NORMAL") driving.push("workload_index");

  return {
    total_freelancers: counts.total_freelancers,
    total_teams: counts.total_teams,
    active_pit_calls: counts.active_pit_calls,
    workload_index,
    freelancer_level,
    active_pit_calls_level,
    workload_level,
    overall_level,
    driving_indicators: driving,
  };
}

export const CAPACITY_LEVEL_LABEL: Record<CapacityLevel, string> = {
  NORMAL: "NORMAL",
  CHECK_CAPACITY: "CHECK CAPACITY",
  PLAN_UPGRADE: "PLAN UPGRADE",
  UPGRADE_NOW: "UPGRADE NOW",
};

export const CAPACITY_LEVEL_COPY: Record<CapacityLevel, string> = {
  NORMAL: "No action required.",
  CHECK_CAPACITY: "Run a manual db_health check and review Lovable Cloud usage when possible.",
  PLAN_UPGRADE: "Review compute/database capacity and prepare a Lovable Cloud instance upgrade.",
  UPGRADE_NOW:
    "Review infrastructure capacity now and plan or perform the required Lovable Cloud upgrade.",
};

export const CAPACITY_DISCLAIMER =
  "Early operational warning based on LIVE platform workload. This is not a measurement of remaining infrastructure capacity.";
