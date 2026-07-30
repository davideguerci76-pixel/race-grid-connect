import { DayPicker, type MonthCaptionProps } from "react-day-picker";
import "react-day-picker/style.css";

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AvailabilityCalendar({
  selected,
  onSelect,
  disabled,
  min,
  legend,
  showBulkActions = true,
  bulkMonths = 6,
}: {
  selected: Date[];
  onSelect: (dates: Date[] | undefined) => void;
  disabled?: (d: Date) => boolean;
  min?: Date;
  legend?: string;
  showBulkActions?: boolean;
  bulkMonths?: number;
}) {
  const isDisabled = (d: Date) => {
    if (disabled) return disabled(d);
    if (min) return d < min;
    return false;
  };

  const selectAll = () => {
    const start = min ? new Date(min) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setMonth(end.getMonth() + bulkMonths);
    const all: Date[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      if (!isDisabled(cur)) all.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    onSelect(all);
  };

  const monthDates = (year: number, month: number): Date[] => {
    const out: Date[] = [];
    const cur = new Date(year, month, 1);
    while (cur.getMonth() === month) {
      if (!isDisabled(cur)) out.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  };

  const selectMonth = (year: number, month: number) => {
    const add = monthDates(year, month);
    const keySet = new Set(selected.map((d) => ymd(d)));
    add.forEach((d) => keySet.add(ymd(d)));
    const merged: Date[] = [];
    const seen = new Set<string>();
    [...selected, ...add].forEach((d) => {
      const k = ymd(d);
      if (!seen.has(k) && keySet.has(k)) { seen.add(k); merged.push(d); }
    });
    onSelect(merged);
  };

  const deselectMonth = (year: number, month: number) => {
    onSelect(selected.filter((d) => !(d.getFullYear() === year && d.getMonth() === month)));
  };

  const monthLabel = (year: number, month: number) =>
    new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const MonthCaption = (props: MonthCaptionProps) => {
    const d = props.calendarMonth.date;
    const y = d.getFullYear();
    const m = d.getMonth();
    const total = monthDates(y, m).length;
    const chosen = selected.filter((x) => x.getFullYear() === y && x.getMonth() === m).length;
    const allChosen = total > 0 && chosen >= total;
    return (
      <div className="flex flex-col items-center gap-1 py-1">
        <div className="font-mono text-[11px] font-bold uppercase tracking-widest">{monthLabel(y, m)}</div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => (allChosen ? deselectMonth(y, m) : selectMonth(y, m))}
            className="border border-border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest hover:border-racing-red hover:text-racing-red"
          >
            {allChosen ? "Deselect month" : "Select month"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="paddock-calendar bg-card border border-border p-4">
      {(legend || showBulkActions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {legend ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block size-3 bg-racing-red" />
              <span>{legend}</span>
            </div>
          ) : <span />}
          {showBulkActions && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="border border-border px-3 py-1 text-[10px] font-bold uppercase tracking-widest hover:border-racing-red hover:text-racing-red"
              >
                Select all ({bulkMonths}m)
              </button>
              <button
                type="button"
                onClick={() => onSelect([])}
                className="border border-border px-3 py-1 text-[10px] font-bold uppercase tracking-widest hover:border-racing-red hover:text-racing-red"
              >
                Deselect all
              </button>
            </div>
          )}
        </div>
      )}
      <DayPicker
        mode="multiple"
        selected={selected}
        onSelect={onSelect}
        disabled={disabled ?? (min ? { before: min } : undefined)}
        weekStartsOn={1}
        showOutsideDays={false}
        numberOfMonths={2}
        components={{ MonthCaption }}
      />
      <style>{`
        .paddock-calendar .rdp-root {
          --rdp-accent-color: var(--racing-red);
          --rdp-accent-background-color: color-mix(in oklab, var(--racing-red) 20%, transparent);
          --rdp-selected-border: 2px solid var(--racing-red);
          --rdp-day_button-border-radius: 0;
          --rdp-day_button-height: 40px;
          --rdp-day_button-width: 40px;
          --rdp-day-height: 40px;
          --rdp-day-width: 40px;
          color: var(--foreground);
          font-family: var(--font-display);
        }
        .paddock-calendar .rdp-caption_label,
        .paddock-calendar .rdp-weekday {
          text-transform: uppercase;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.15em;
          color: var(--muted-foreground);
        }
        .paddock-calendar .rdp-caption_label { color: var(--foreground); }
        .paddock-calendar .rdp-day_button { border-radius: 0; font-family: var(--font-mono); font-size: 13px; }
        .paddock-calendar .rdp-day_button:hover { background: var(--secondary); }
        .paddock-calendar .rdp-selected .rdp-day_button {
          background: var(--racing-red);
          color: white;
        }
        .paddock-calendar .rdp-today .rdp-day_button {
          outline: 1px solid var(--racing-yellow);
        }
      `}</style>
    </div>
  );
}
