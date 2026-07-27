// Utilities to generate quick-add calendar links and contact exports
// for the "Match Confirmed" surfaces.

export type CalendarEvent = {
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD (inclusive)
  location?: string | null;
  description?: string | null;
};

export type ContactCard = {
  fullName: string;
  email?: string | null;
  phone?: string | null; // full E.164 or dial-code + number
  organization?: string | null;
  title?: string | null;
  notes?: string | null;
};

function toCalDate(d: string): string {
  // date-only format for all-day events in ICS / Google Calendar (YYYYMMDD)
  return d.replaceAll("-", "");
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Build a "quick add" Google Calendar URL. Google expects all-day events with an
 * exclusive end date (end = last day + 1).
 */
export function buildGoogleCalendarUrl(ev: CalendarEvent): string {
  const dates = `${toCalDate(ev.startDate)}/${toCalDate(addDays(ev.endDate, 1))}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates,
  });
  if (ev.location) params.set("location", ev.location);
  if (ev.description) params.set("details", ev.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildIcsFile(ev: CalendarEvent): string {
  const dtStart = toCalDate(ev.startDate);
  const dtEnd = toCalDate(addDays(ev.endDate, 1)); // exclusive
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@paddockmatch`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PaddockMatch//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    ev.location ? `LOCATION:${icsEscape(ev.location)}` : "",
    ev.description ? `DESCRIPTION:${icsEscape(ev.description)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

export function downloadFile(filename: string, contents: string, mime: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadIcs(ev: CalendarEvent, filename = "match.ics"): void {
  downloadFile(filename, buildIcsFile(ev), "text/calendar;charset=utf-8");
}

export function buildVCard(c: ContactCard): string {
  const [first, ...rest] = (c.fullName || "").trim().split(/\s+/);
  const last = rest.join(" ");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${last};${first};;;`,
    `FN:${c.fullName}`,
    c.organization ? `ORG:${c.organization}` : "",
    c.title ? `TITLE:${c.title}` : "",
    c.email ? `EMAIL;TYPE=INTERNET:${c.email}` : "",
    c.phone ? `TEL;TYPE=CELL,VOICE:${c.phone}` : "",
    c.notes ? `NOTE:${c.notes.replace(/\n/g, "\\n")}` : "",
    "END:VCARD",
  ].filter(Boolean);
  return lines.join("\r\n");
}

export function downloadVCard(c: ContactCard, filename?: string): void {
  const fn = filename ?? `${(c.fullName || "contact").replace(/[^a-z0-9\-_]+/gi, "_")}.vcf`;
  downloadFile(fn, buildVCard(c), "text/vcard;charset=utf-8");
}

/**
 * Google Contacts doesn't officially expose a "new contact from URL" endpoint,
 * but the /new form accepts these query parameters as prefills.
 */
export function buildGoogleContactsUrl(c: ContactCard): string {
  const params = new URLSearchParams();
  if (c.fullName) params.set("name", c.fullName);
  if (c.email) params.set("email", c.email);
  if (c.phone) params.set("phone", c.phone);
  if (c.organization) params.set("company", c.organization);
  if (c.title) params.set("jobTitle", c.title);
  return `https://contacts.google.com/new?${params.toString()}`;
}
