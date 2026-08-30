import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Calendar } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getMyAvailability, getMyBlockedDates } from "@/lib/paddock.functions";
import { getMyEngagementDays } from "@/lib/calendar-notes.functions";
import { calendarDayState } from "@/lib/calendar-days";
import { isoOf } from "@/lib/ics";
import { useDateFormat } from "@/lib/date-locale";

/** Monday-first 42-day grid for the given month (presentational). */
function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

const CELL_CLASS: Record<string, string> = {
  none: "bg-[#0d0f13]",
  available: "bg-[#145c36]",
  busy: "bg-[#17191e]",
  engagement: "bg-[#2a1013] shadow-[inset_0_0_8px_-3px_var(--racing-red)]",
  locked: "bg-[#2a1013] shadow-[inset_0_0_8px_-3px_var(--racing-red)]",
};

/**
 * Read-only mini calendar preview for the Freelancer dashboard.
 * Whole card is a Link to /dashboard/calendar; cells are inert (no buttons).
 * Reuses the same owner-scoped queries and day-state helper as the full
 * calendar — no private notes are loaded.
 */
export function MiniAvailabilityCard({ fallback }: { fallback: React.ReactNode }) {
  const { t } = useTranslation();
  const { formatMonthYear, formatCustom } = useDateFormat();
  const { user } = useAuth();
  const getAvail = useServerFn(getMyAvailability);
  const getBlocked = useServerFn(getMyBlockedDates);
  const getEngDays = useServerFn(getMyEngagementDays);

  const availQ = useQuery({ queryKey: ["my-availability", user?.id], enabled: !!user, queryFn: () => getAvail() });
  const blockedQ = useQuery({ queryKey: ["my-blocked-dates", user?.id], enabled: !!user, queryFn: () => getBlocked() });
  const engQ = useQuery({ queryKey: ["my-engagement-days", user?.id], enabled: !!user, queryFn: () => getEngDays() });

  // View-only month offset: never persisted, always resets to the real current month.
  const [offset, setOffset] = useState(0);
  const month = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + offset, 1);
  }, [offset]);
  const days = useMemo(() => monthGrid(month), [month]);
  const todayIso = isoOf(new Date());
  const monthParam = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => formatCustom(new Date(2024, 0, 1 + i), { weekday: "narrow" })),
    [formatCustom],
  );

  const states = useMemo(() => {
    if (!availQ.data || !blockedQ.data || !engQ.data) return null;
    const blockedSet = new Set(blockedQ.data as string[]);
    const availableSet = new Set((availQ.data as string[]).filter((d) => !blockedSet.has(d)));
    const engMap = new Map<string, { locked?: boolean | null }>();
    for (const e of engQ.data as Array<{ day: string; locked?: boolean | null }>) {
      if (!engMap.has(e.day) || (!e.locked && engMap.get(e.day)!.locked)) engMap.set(e.day, e);
    }
    const map = new Map<string, string>();
    for (const d of days) {
      map.set(isoOf(d), calendarDayState(isoOf(d), { available: availableSet, blocked: blockedSet, engagements: engMap }));
    }
    return map;
  }, [availQ.data, blockedQ.data, engQ.data, days]);

  const stats = useMemo(() => {
    if (!states) return null;
    let available = 0, busy = 0, pitcall = 0;
    for (const d of days) {
      if (d.getMonth() !== month.getMonth()) continue;
      const s = states.get(isoOf(d));
      if (s === "available") available += 1;
      else if (s === "engagement" || s === "locked") pitcall += 1;
      else busy += 1;
    }
    return { available, busy, pitcall };
  }, [states, days, month]);

  if (availQ.isError || blockedQ.isError || engQ.isError) return <>{fallback}</>;

  const loading = !states;

  return (
    <Link
      to="/dashboard/calendar"
      search={{ m: monthParam }}
      className="group block border border-border bg-card p-4 transition-colors hover:border-racing-red sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Calendar className="size-5 shrink-0 text-racing-red" strokeWidth={1.5} />
          <span className="label-mono truncate">{t("dashboard.my_availability_label")}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <MonthArrow label="‹" onActivate={() => setOffset((o) => o - 1)} />
          <span className="min-w-[92px] text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {formatMonthYear(month)}
          </span>
          <MonthArrow label="›" onActivate={() => setOffset((o) => o + 1)} />
        </div>
      </div>

      <div className="mx-auto mt-3 grid w-full max-w-[260px] grid-cols-7 gap-[3px] sm:max-w-[300px]" aria-hidden>
        {weekdays.map((w, i) => (
          <span key={i} className="text-center font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
            {w}
          </span>
        ))}
      </div>

      <div className="mx-auto mt-1 grid w-full max-w-[260px] grid-cols-7 gap-[3px] sm:max-w-[300px]" aria-hidden>
        {(loading ? Array.from({ length: 42 }, () => null) : days).map((d, i) => {
          if (d === null) {
            return <span key={i} className="aspect-square animate-pulse bg-[#15181d]" />;
          }
          const iso = isoOf(d);
          const state = states!.get(iso) ?? "none";
          const outside = d.getMonth() !== month.getMonth();
          return (
            <span
              key={iso}
              className={`flex aspect-square items-center justify-center font-mono text-[9px] ${CELL_CLASS[state]} ${outside ? "opacity-30" : ""}`}
            >
              <span className={iso === todayIso && !outside ? "bg-racing-yellow px-1 font-black text-carbon" : "text-muted-foreground"}>
                {d.getDate()}
              </span>
            </span>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
        <MiniStat value={loading ? "–" : stats!.available} label={t("pcal.stat_available_short")} dot="bg-[#145c36]" />
        <MiniStat value={loading ? "–" : stats!.busy} label={t("pcal.stat_busy_short")} dot="bg-[#17191e]" />
        <MiniStat value={loading ? "–" : stats!.pitcall} label={t("pcal.stat_pitcall_short")} dot="bg-[#2a1013]" />
      </div>
    </Link>
  );
}

function MiniStat({ value, label, dot }: { value: React.ReactNode; label: string; dot: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className={`inline-block size-2.5 shrink-0 ${dot}`} />
      <span className="text-base font-black leading-none">{value}</span>
      <span className="font-mono text-[8px] uppercase leading-tight tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * Month stepper rendered inside the card link: a span with button semantics so
 * no interactive element is nested inside the anchor. Stops the click from
 * triggering the card navigation.
 */
function MonthArrow({ label, onActivate }: { label: string; onActivate: () => void }) {
  const fire = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onActivate();
  };
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={label === "‹" ? "Previous month" : "Next month"}
      onClick={fire}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") fire(e);
      }}
      className="flex size-7 cursor-pointer select-none items-center justify-center border border-border font-mono text-xs leading-none text-muted-foreground transition-colors hover:border-racing-red hover:text-racing-red"
    >
      {label}
    </span>
  );
}
