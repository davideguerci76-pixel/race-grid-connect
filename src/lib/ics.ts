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

/** Monday of the week containing `iso` (week starts on Monday). */
export function mondayOf(iso: string): string {
  const d = dateOf(iso);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return isoOf(d);
}

export function expandRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cur = startIso;
  let guard = 0;
  while (cur <= endIso && guard < 400) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
    guard += 1;
  }
  return out;
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

function parseIcsDate(value: string): string | null {
  const v = value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Parse an .ics file into a list of all-day events (inclusive end dates). */
export function parseIcs(text: string): CalendarEventItem[] {
  const lines = unfold(text);
  const events: CalendarEventItem[] = [];
  let cur: { title?: string; start?: string; end?: string; dateOnlyEnd?: boolean } | null = null;

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
        events.push({ title: cur.title?.trim() || "Event", start: cur.start, end: end < cur.start ? cur.start : end });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).toUpperCase();
    const value = line.slice(idx + 1);
    if (key.startsWith("DTSTART")) cur.start = parseIcsDate(value) ?? undefined;
    else if (key.startsWith("DTEND")) {
      cur.end = parseIcsDate(value) ?? undefined;
      cur.dateOnlyEnd = key.includes("VALUE=DATE") || /^\d{8}$/.test(value.trim());
    } else if (key.startsWith("SUMMARY")) cur.title = value.replace(/\\,/g, ",").replace(/\\n/g, " ");
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
