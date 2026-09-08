// Minimal iCalendar (.ics) parsing + helpers for championship calendars.

export type CalendarEventItem = {
  title: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (inclusive)
};

export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dateOf(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function addDaysIso(iso: string, days: number): string {
  const d = dateOf(iso);
  d.setDate(d.getDate() + days);
  return isoOf(d);
}

/**
 * Calendar-month arithmetic (not 365 days): the day-of-month is preserved and
 * clamped to the last day of the target month, so year rollovers, short months
 * and leap days all land on the date a human expects.
 */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const year = y!;
  const monthIdx = (m ?? 1) - 1 + months;
  const targetYear = year + Math.floor(monthIdx / 12);
  const targetMonth = ((monthIdx % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return isoOf(new Date(targetYear, targetMonth, Math.min(d ?? 1, lastDay)));
}

/** Monday of the week containing `iso` (week starts on Monday). */
export function mondayOf(iso: string): string {
  const d = dateOf(iso);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return isoOf(d);
}

/**
 * Server-authoritative calendar limits (mirrored from calendars.functions.ts).
 * These are storage bounds for ONE saved calendar row, not an operation batch
 * size: bulk availability operations are chunked and are not capped by them.
 */
export const MAX_CALENDAR_EVENTS = 1000;
export const MAX_CALENDAR_DAYS = 2000;
/** Hard safety bound while expanding a single recurrence rule. */
export const MAX_RRULE_OCCURRENCES = 400;

/** Exact number of inclusive days in a range — never truncated. */
export function rangeDayCount(startIso: string, endIso: string): number {
  const start = dateOf(startIso).getTime();
  const end = dateOf(endIso).getTime();
  if (end < start) return 1;
  return Math.round((end - start) / 86400000) + 1;
}

export function expandRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cur = startIso;
  let guard = 0;
  // Guard only protects against a corrupt/inverted range; it must never silently
  // truncate a legitimate calendar (that is what checkCalendarLimits reports).
  while (cur <= endIso && guard < MAX_CALENDAR_DAYS * 2) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
    guard += 1;
  }
  return out;
}


export type CalendarLimitViolation =
  | { kind: "events"; actual: number; limit: number }
  | { kind: "days"; actual: number; limit: number };

/**
 * Explicit limit detection so oversized imports fail loudly in the UI instead of
 * being silently truncated or rejected by the server with an opaque error.
 */
export function checkCalendarLimits(input: { events?: CalendarEventItem[]; dates?: string[] }): CalendarLimitViolation | null {
  const events = input.events ?? [];
  if (events.length > MAX_CALENDAR_EVENTS) {
    return { kind: "events", actual: events.length, limit: MAX_CALENDAR_EVENTS };
  }
  const dayCount = input.dates
    ? new Set(input.dates).size
    : events.reduce((n, e) => n + rangeDayCount(e.start, e.end), 0);
  if (dayCount > MAX_CALENDAR_DAYS) {
    return { kind: "days", actual: dayCount, limit: MAX_CALENDAR_DAYS };
  }
  return null;
}


function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/**
 * PITCALL availability is DAY-LEVEL. A calendar date must survive the import as
 * the day a human reads on the event, never shifted by a UTC conversion.
 *  - `VALUE=DATE` (YYYYMMDD) and `TZID=...` date-times: the literal date wins.
 *  - UTC date-times (trailing `Z`): converted to the reader's local day, so an
 *    event at 23:00Z stays on its local calendar day instead of slipping back.
 */
function parseIcsDate(value: string, key = ""): string | null {
  const v = value.trim();
  const utc = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v);
  if (utc && !/TZID=/i.test(key)) {
    const ms = Date.UTC(+utc[1]!, +utc[2]! - 1, +utc[3]!, +utc[4]!, +utc[5]!, +utc[6]!);
    return isoOf(new Date(ms));
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

type RRuleParts = { freq?: string; interval: number; count?: number; until?: string; byday: string[] };

function parseRRule(value: string): RRuleParts | null {
  const parts: RRuleParts = { interval: 1, byday: [] };
  for (const chunk of value.trim().split(";")) {
    const [rawK, rawV] = chunk.split("=");
    if (!rawK || !rawV) continue;
    const k = rawK.toUpperCase();
    const v = rawV.trim();
    if (k === "FREQ") parts.freq = v.toUpperCase();
    else if (k === "INTERVAL") parts.interval = Math.max(1, Number(v) || 1);
    else if (k === "COUNT") parts.count = Math.max(1, Number(v) || 1);
    else if (k === "UNTIL") parts.until = parseIcsDate(v) ?? undefined;
    else if (k === "BYDAY") parts.byday = v.toUpperCase().split(",").map((d) => d.trim().replace(/^[+-]?\d+/, ""));
  }
  if (!parts.freq) return null;
  return parts;
}

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Safety horizon for a recurrence that declares neither COUNT nor UNTIL. */
export const UNBOUNDED_RRULE_MAX_MONTHS = 12;

/**
 * Minimal RFC5545 expansion covering the recurrences real motorsport calendars
 * use: DAILY / WEEKLY (with BYDAY) / MONTHLY / YEARLY, plus INTERVAL, COUNT and
 * UNTIL. Anything else is left as the single DTSTART occurrence (never silently
 * partially expanded into a corrupt series).
 *
 * A rule with neither COUNT nor UNTIL is temporally infinite; it is expanded up
 * to 12 calendar months from DTSTART. Rules that declare COUNT or UNTIL keep
 * their own natural bound and are never extended or shortened by this horizon.
 */
function expandRRule(start: string, spanDays: number, rule: RRuleParts): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = [];
  const push = (s: string) => out.push({ start: s, end: addDaysIso(s, spanDays) });
  const limit = Math.min(rule.count ?? MAX_RRULE_OCCURRENCES, MAX_RRULE_OCCURRENCES);
  const unbounded = rule.count === undefined && !rule.until;
  // Horizon ends the day before the 12-month anniversary, so a window of exactly
  // 12 calendar months never spills a 13th-month occurrence (e.g. YEARLY).
  const until = rule.until ?? (unbounded ? addDaysIso(addMonthsIso(start, UNBOUNDED_RRULE_MAX_MONTHS), -1) : null);


  if (rule.freq === "WEEKLY" && rule.byday.length) {
    const wanted = new Set(rule.byday);
    let weekStart = mondayOf(start);
    let weeks = 0;
    while (out.length < limit && weeks < MAX_RRULE_OCCURRENCES) {
      for (let i = 0; i < 7 && out.length < limit; i += 1) {
        const day = addDaysIso(weekStart, i);
        if (day < start) continue;
        if (until && day > until) return out;
        if (wanted.has(WEEKDAY_CODES[dateOf(day).getDay()]!)) push(day);
      }
      weekStart = addDaysIso(weekStart, 7 * rule.interval);
      weeks += 1;
    }
    return out;
  }

  let cursor = start;
  while (out.length < limit) {
    if (until && cursor > until) break;
    push(cursor);
    if (rule.freq === "DAILY") cursor = addDaysIso(cursor, rule.interval);
    else if (rule.freq === "WEEKLY") cursor = addDaysIso(cursor, 7 * rule.interval);
    else if (rule.freq === "MONTHLY" || rule.freq === "YEARLY") {
      const d = dateOf(cursor);
      if (rule.freq === "MONTHLY") d.setMonth(d.getMonth() + rule.interval);
      else d.setFullYear(d.getFullYear() + rule.interval);
      cursor = isoOf(d);
    } else break; // unsupported FREQ → single occurrence only
    
  }
  return out;
}

/** Parse an .ics file into a list of all-day events (inclusive end dates). */
export function parseIcs(text: string): CalendarEventItem[] {
  const lines = unfold(text);
  const events: CalendarEventItem[] = [];
  let cur: { title?: string; start?: string; end?: string; dateOnlyEnd?: boolean; rrule?: RRuleParts | null } | null = null;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith("BEGIN:VEVENT")) {
      cur = {};
      continue;
    }
    if (upper.startsWith("END:VEVENT")) {
      if (cur?.start) {
        let end = cur.end ?? cur.start;
        // DTEND is exclusive for all-day events
        if (cur.dateOnlyEnd && end > cur.start) end = addDaysIso(end, -1);
        if (end < cur.start) end = cur.start;
        const title = cur.title?.trim() || "Event";
        const spanDays = rangeDayCount(cur.start, end) - 1;
        if (cur.rrule) {
          for (const occ of expandRRule(cur.start, spanDays, cur.rrule)) {
            events.push({ title, start: occ.start, end: occ.end });
          }
        } else {
          events.push({ title, start: cur.start, end });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).toUpperCase();
    const value = line.slice(idx + 1);
    if (key.startsWith("DTSTART")) cur.start = parseIcsDate(value, key) ?? undefined;
    else if (key.startsWith("DTEND")) {
      cur.end = parseIcsDate(value, key) ?? undefined;
      cur.dateOnlyEnd = key.includes("VALUE=DATE") || /^\d{8}$/.test(value.trim());
    } else if (key.startsWith("RRULE")) cur.rrule = parseRRule(value);
    else if (key.startsWith("SUMMARY")) cur.title = value.replace(/\\,/g, ",").replace(/\\n/g, " ");
  }

  return events.sort((a, b) => a.start.localeCompare(b.start));
}


/** Group a flat list of days into contiguous "events" (rounds). */
export function daysToEvents(days: string[], namePrefix = "Round"): CalendarEventItem[] {
  const sorted = [...new Set(days)].sort();
  const out: CalendarEventItem[] = [];
  let start: string | null = null;
  let prev: string | null = null;
  for (const d of sorted) {
    if (start == null) {
      start = d;
    } else if (prev && addDaysIso(prev, 1) !== d) {
      out.push({ title: `${namePrefix} ${out.length + 1}`, start, end: prev });
      start = d;
    }
    prev = d;
  }
  if (start && prev) out.push({ title: `${namePrefix} ${out.length + 1}`, start, end: prev });
  return out;
}

export function buildIcsFromEvents(name: string, events: CalendarEventItem[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PitCall//Calendars//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${name}`];
  events.forEach((ev, i) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${stamp}-${i}@pitcall`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ev.start.replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${addDaysIso(ev.end, 1).replaceAll("-", "")}`,
      `SUMMARY:${ev.title.replace(/,/g, "\\,")}`,
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
