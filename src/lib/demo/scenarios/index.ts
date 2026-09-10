import type { DemoScenario } from "./types";
import { DEMO_V1 } from "./v1";

/**
 * Scenario registry. Adding a future DEMO V2/V3 means adding a manifest here:
 * the seeder, the verifier and the Demo Guide are generic.
 */
export const DEMO_SCENARIOS: Record<string, DemoScenario> = {
  [DEMO_V1.id]: DEMO_V1,
};

export const DEMO_SCENARIO_LIST = Object.values(DEMO_SCENARIOS);

export function getScenario(id: string): DemoScenario {
  const s = DEMO_SCENARIOS[id];
  if (!s) throw new Error(`Unknown demo scenario "${id}"`);
  return s;
}

export type { DemoScenario };
