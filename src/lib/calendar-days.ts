/**
 * Shared helpers for the PITCALL calendar surface.
 * No business logic lives here: it only reads existing engagement/availability
 * data and reshapes it for the calendar UI.
 */

export function isoOfUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function daysBetweenIso(start: string, end: string): string[] {
  const days: string[] = [];
  const cur = new Date(`${String(start).slice(0, 10)}T00:00:00.000Z`);
  const last = new Date(`${String(end).slice(0, 10)}T00:00:00.000Z`);
  let guard = 0;
  while (!Number.isNaN(cur.getTime()) && !Number.isNaN(last.getTime()) && cur.getTime() <= last.getTime() && guard < 800) {
    days.push(isoOfUtc(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard += 1;
  }
  return days;
}
