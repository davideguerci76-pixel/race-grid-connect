import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

export function AvailabilityCalendar({
  selected,
  onSelect,
  disabled,
  min,
}: {
  selected: Date[];
  onSelect: (dates: Date[] | undefined) => void;
  disabled?: (d: Date) => boolean;
  min?: Date;
}) {
  return (
    <div className="paddock-calendar bg-card border border-border p-4">
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
