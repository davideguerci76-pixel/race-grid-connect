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

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveDay(anchor: string, day: DemoDay, now: Date = new Date()): string {
  if (day === "today") return todayISO(now);
  if (typeof day === "string") {
    if (!ISO_RE.test(day)) throw new Error(`Invalid demo day "${day}"`);
    return day;
  }
  return isoDay(new Date(new Date(`${anchor}T00:00:00.000Z`).getTime() + day * DAY_MS));
}

/** Expand inclusive ISO ranges (championship rounds) into the list of days. */
export function expandRanges(ranges: { start: string; end: string }[]): string[] {
  const out = new Set<string>();
  for (const r of ranges) {
    let t = new Date(`${r.start}T00:00:00.000Z`).getTime();
    const end = new Date(`${r.end}T00:00:00.000Z`).getTime();
    let guard = 0;
    while (t <= end && guard < 400) {
      out.add(isoDay(new Date(t)));
      t += DAY_MS;
      guard += 1;
    }
  }
  return Array.from(out).sort();
}

export function resolveDays(anchor: string, days: DemoDay[], now: Date = new Date()): string[] {
  return Array.from(new Set(days.map((d) => resolveDay(anchor, d, now)))).sort();
}
