import { useTranslation } from "react-i18next";
import { useDateFormat } from "@/lib/date-locale";

/** Normalize an ISO date array: strip time, dedupe, sort ascending. */
export function normalizeIsoDates(dates: unknown): string[] {
  if (!Array.isArray(dates)) return [];
  const set = new Set<string>();
  for (const d of dates) {
    if (typeof d !== "string" && !(d instanceof Date)) continue;
    const iso = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) set.add(iso);
  }
  return Array.from(set).sort();
}

/** Group consecutive days into runs: ["2026-03-10","2026-03-11","2026-03-24"] -> [[10,11],[24]]. */
export function groupConsecutive(dates: string[]): string[][] {
  const out: string[][] = [];
  for (const d of dates) {
    const last = out[out.length - 1];
    if (last) {
      const prev = new Date(`${last[last.length - 1]}T00:00:00Z`);
      prev.setUTCDate(prev.getUTCDate() + 1);
      if (prev.toISOString().slice(0, 10) === d) {
        last.push(d);
        continue;
      }
    }
    out.push([d]);
  }
  return out;
}

/**
 * Compact, human-readable required dates for a Championship (sparse) Pit Call:
 * "10–11 Mar · 24–25 Mar · 14–15 Apr". Never implies a continuous range.
 */
export function useRequiredDatesText() {
  const { formatCustom } = useDateFormat();
  return (dates: string[], maxGroups = 6) => {
    const groups = groupConsecutive(dates);
    const shown = groups.slice(0, maxGroups);
    const parts = shown.map((g) => {
      const first = g[0];
      const last = g[g.length - 1];
      const sameMonth = first.slice(0, 7) === last.slice(0, 7);
      const fmtDay = (d: string) => formatCustom(`${d}T00:00:00`, { day: "numeric" });
      const fmtDayMonth = (d: string) => formatCustom(`${d}T00:00:00`, { day: "numeric", month: "short" });
      if (g.length === 1) return fmtDayMonth(first);
      return sameMonth ? `${fmtDay(first)}–${fmtDayMonth(last)}` : `${fmtDayMonth(first)}–${fmtDayMonth(last)}`;
    });
    if (groups.length > maxGroups) parts.push("…");
    return parts.join(" · ");
  };
}

type Props = {
  /** Request-like object with duration / season_dates / start_date / end_date. */
  request: { duration?: string | null; season_dates?: string[] | null; start_date?: string | null; end_date?: string | null } | null | undefined;
  /**
   * Optional engagement snapshot (covered_days). This is the contractual snapshot of the
   * days actually covered — it NEVER identifies the Pit Call type, it only supplies the dates.
   */
  dates?: string[] | null;
  className?: string;
  /** Show the compact sparse date list under the day count. */
  detailed?: boolean;
};

/**
 * Single semantic renderer for Pit Call dates.
 * Type authority is the request itself (`duration === "full_season"`), never the shape of
 * `covered_days`: ordinary Pit Calls also have covered_days and must render as a plain range.
 * - Championship (duration full_season, sparse season_dates / covered_days): "6 CHAMPIONSHIP DAYS" + list.
 * - Full Season without sparse dates: plain start → end range.
 * - Ordinary Pit Call: plain start → end range.
 */
export function PitCallDates({ request, dates, className, detailed = true }: Props) {
  const { t } = useTranslation();
  const text = useRequiredDatesText();
  const required = normalizeIsoDates(dates ?? request?.season_dates);
  const isChampionship = request?.duration === "full_season";


  if (!isChampionship) {
    const start = dates?.length ? required[0] : request?.start_date;
    const end = dates?.length ? required[required.length - 1] : request?.end_date;
    if (!start) return null;
    return <span className={className}>{start} → {end}</span>;
  }

  if (!required.length) {
    if (!request?.start_date) return null;
    return <span className={className}>{request.start_date} → {request.end_date}</span>;
  }

  return (
    <span className={className}>
      <span className="text-racing-yellow">{t("championship.days_count", { count: required.length })}</span>
      {detailed && <> · {text(required)}</>}
    </span>
  );
}
