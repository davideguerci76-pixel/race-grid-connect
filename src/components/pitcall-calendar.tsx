import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDateFormat } from "@/lib/date-locale";
import { isoOf } from "@/lib/ics";

export type PitcallDayState = "none" | "available" | "busy" | "engagement" | "locked";

export type PitcallDayCell = {
  state: PitcallDayState;
  /** Short micro-label rendered inside the cell (truncated on mobile). */
  label?: string | null;
  /** Concurrent items on the same day (Team calendar). */
  count?: number;
  /** Availability declared but not recently reviewed. */
  unconfirmed?: boolean;
  /** Highlighted as a suggested day (e.g. HOT Partial missing Required Day). */
  highlighted?: boolean;
  disabled?: boolean;
};

const WEEKDAY_KEYS = [1, 2, 3, 4, 5, 6, 0];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function gridDays(month: Date): Date[] {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const start = new Date(first);
  start.setDate(start.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

const STATE_CLASS: Record<PitcallDayState, string> = {
  none: "bg-[#0d0f13] text-foreground",
  available: "bg-[#145c36] text-foreground",
  busy: "bg-[#17191e] text-foreground",
  engagement: "bg-[#2a1013] text-foreground",
  locked: "bg-[#2a1013] text-foreground",
};

const CHIP_CLASS: Record<PitcallDayState, string> = {
  none: "border-l-2 border-border bg-[#15181d] text-muted-foreground",
  available: "border-l-2 border-[#22c55e] bg-[#22c55e]/20 text-[#a7f3c6]",
  busy: "border-l-2 border-[#5b6070] bg-[#20242b] text-[#c9cedb]",
  engagement: "border-l-2 border-racing-red bg-racing-red/25 text-[#ffd3d3]",
  locked: "border-l-2 border-racing-red bg-racing-red text-white",
};

export function PitcallCalendar({
  month,
  onMonthChange,
  cells,
  selected,
  onSelectDay,
  onToggleDay,
  legend,
  stats,
  detail,
  todayLabel,
  actions,
}: {
  month: Date;
  onMonthChange: (d: Date) => void;
  cells: Map<string, PitcallDayCell>;
  selected: string | null;
  onSelectDay: (iso: string) => void;
  onToggleDay?: (iso: string) => void;
  legend?: React.ReactNode;
  stats?: React.ReactNode;
  detail?: React.ReactNode;
  todayLabel: string;
  actions?: React.ReactNode;
}) {
  const { formatMonthYear, dateFnsLocale } = useDateFormat();
  const days = useMemo(() => gridDays(month), [month]);
  const todayIso = isoOf(new Date());

  const weekdayNames = useMemo(() => {
    const base = new Date(2024, 0, 1); // Monday
    return WEEKDAY_KEYS.map((_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return (dateFnsLocale as any)?.localize?.day?.(d.getDay(), { width: "abbreviated" }) ?? d.toLocaleDateString(undefined, { weekday: "short" });
    });
  }, [dateFnsLocale]);

  const shift = (delta: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return (
    <section className="min-w-0 border border-border bg-card">
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border p-2 sm:p-3">
        <button
          type="button"
          aria-label="prev"
          onClick={() => shift(-1)}
          className="border border-border p-2 text-muted-foreground hover:border-racing-red hover:text-racing-red"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="min-w-0 text-center font-black uppercase italic tracking-tight text-base sm:text-xl">
          {formatMonthYear(month)}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMonthChange(startOfMonth(new Date()))}
            className="hidden bg-racing-red px-3 py-2 font-mono text-[10px] font-black uppercase tracking-widest text-white hover:brightness-110 sm:inline-block"
          >
            {todayLabel}
          </button>
          <button
            type="button"
            aria-label="next"
            onClick={() => shift(1)}
            className="border border-border p-2 text-muted-foreground hover:border-racing-red hover:text-racing-red"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </header>

      {actions && <div className="border-b border-border p-2 sm:p-3">{actions}</div>}

      <div className="grid grid-cols-7 border-b border-border">
        {weekdayNames.map((w, i) => (
          <div key={i} className="truncate px-1 py-2 text-center font-mono text-[9px] uppercase tracking-widest text-muted-foreground sm:text-[10px]">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((d) => {
          const iso = isoOf(d);
          const cell = cells.get(iso) ?? { state: "none" as PitcallDayState };
          const outside = d.getMonth() !== month.getMonth();
          const isSelected = selected === iso;
          const isRed = cell.state === "engagement" || cell.state === "locked";
          return (
            <button
              key={iso}
              type="button"
              onClick={() => {
                onSelectDay(iso);
                if (!isRed && !cell.disabled && onToggleDay) onToggleDay(iso);
              }}
              className={[
                "relative flex min-h-[64px] min-w-0 flex-col items-stretch gap-1 border-b border-r border-border p-1 text-left transition-colors sm:min-h-[92px] sm:p-1.5",
                STATE_CLASS[cell.state],
                outside ? "opacity-35" : "",
                cell.disabled ? "cursor-default" : "hover:brightness-125",
                isSelected ? "outline outline-2 -outline-offset-2 outline-white" : "",
                isRed ? "shadow-[inset_0_0_18px_-6px_var(--racing-red)]" : "",
                cell.unconfirmed ? "ring-1 ring-inset ring-dashed ring-[#16a34a]" : "",
              ].join(" ")}
            >
              <span className="flex items-center justify-between gap-1">
                <span
                  className={`font-mono text-[11px] ${iso === todayIso ? "bg-racing-yellow px-1 font-black text-carbon" : "text-muted-foreground"}`}
                >
                  {d.getDate()}
                </span>
                {!!cell.count && cell.count > 1 && (
                  <span className="grid size-4 shrink-0 place-items-center rounded-full bg-racing-red font-mono text-[9px] font-black text-white sm:size-5 sm:text-[10px]">
                    {cell.count}
                  </span>
                )}
              </span>
              {cell.label && (
                <span
                  className={`block truncate px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider sm:text-[9px] ${CHIP_CLASS[cell.state]}`}
                >
                  {cell.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {legend && <div className="flex flex-wrap items-center gap-3 border-t border-border p-2 sm:p-3">{legend}</div>}
      {stats && <div className="grid grid-cols-3 gap-2 border-t border-border p-3">{stats}</div>}
      {detail && <div className="min-w-0 border-t border-border p-3">{detail}</div>}
    </section>
  );
}

export function CalendarStat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xl font-black leading-none sm:text-2xl">{value}</div>
      <div className="mt-1 truncate font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

export function CalendarLegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground sm:text-[10px]">
      <span className={`inline-block size-3 shrink-0 ${className}`} />
      <span className="truncate">{label}</span>
    </span>
  );
}
