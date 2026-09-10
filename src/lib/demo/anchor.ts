// Relative-date resolution for DEMO scenarios.
// No absolute dates ever live in a manifest: everything is expressed as an
// offset from an anchor computed at seed time, so a scenario keeps working
// months later without any time machine.

import type { DemoDay } from "./scenarios/types";

const DAY_MS = 86400000;

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function todayISO(now: Date = new Date()): string {
  return isoDay(now);
}

/** Anchor = Monday of next week (always strictly in the future). */
export function computeAnchor(now: Date = new Date()): string {
  const base = new Date(`${isoDay(now)}T00:00:00.000Z`);
  const dow = base.getUTCDay(); // 0 = Sunday
  const daysToNextMonday = dow === 1 ? 7 : (8 - dow) % 7 || 7;
  return isoDay(new Date(base.getTime() + daysToNextMonday * DAY_MS));
}

export function resolveDay(anchor: string, day: DemoDay, now: Date = new Date()): string {
  if (day === "today") return todayISO(now);
  return isoDay(new Date(new Date(`${anchor}T00:00:00.000Z`).getTime() + day * DAY_MS));
}

export function resolveDays(anchor: string, days: DemoDay[], now: Date = new Date()): string[] {
  return Array.from(new Set(days.map((d) => resolveDay(anchor, d, now)))).sort();
}
