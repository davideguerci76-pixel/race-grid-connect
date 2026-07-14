import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

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
  const selectAll = () => {
    const start = min ? new Date(min) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setMonth(end.getMonth() + bulkMonths);
    const all: Date[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      if (!disabled || !disabled(cur)) all.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    onSelect(all);
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
