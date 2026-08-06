import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarRange, Upload, Save, ListChecks } from "lucide-react";
import { listMyCalendars, saveCalendar } from "@/lib/calendars.functions";
import { CalendarQuickFillDialog } from "@/components/calendar-quick-fill";
import { daysToEvents, isoOf, parseIcs, type CalendarEventItem } from "@/lib/ics";

const btn =
  "inline-flex items-center gap-2 border border-border bg-background px-3 py-2 font-mono text-[10px] uppercase tracking-widest hover:border-racing-red hover:text-racing-red transition-colors";

/**
 * Shared toolbar to fill a set of days from: personal/approved calendars,
 * an .ics import, or the quick-fill logistics popup. Also saves the current
 * selection to the user's personal calendar archive.
 */
export function CalendarSourcePicker({
  value,
  onChange,
  saveLabel = "Save as my calendar",
  className,
}: {
  value: string[]; // ISO days
  onChange: (dates: string[]) => void;
  saveLabel?: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listMyCalendars);
  const save = useServerFn(saveCalendar);
  const fileRef = useRef<HTMLInputElement>(null);
  const [quickEvents, setQuickEvents] = useState<CalendarEventItem[] | null>(null);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({ queryKey: ["my-calendars"], queryFn: () => list() });
  const options = [...(data?.mine ?? []), ...(data?.shared ?? [])];

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const events = parseIcs(text);
      if (!events.length) {
        toast.error("No events found in this .ics file");
        return;
      }
      setQuickEvents(events);
    } catch {
      toast.error("Could not read the .ics file");
    }
  };

  const pickCalendar = (id: string) => {
    const cal = options.find((c) => c.id === id);
    if (!cal) return;
    const events = cal.events?.length ? cal.events : daysToEvents(cal.dates);
    if (events.length) setQuickEvents(events);
    else onChange(cal.dates);
  };

  const saveCurrent = async () => {
    if (!value.length) {
      toast.error("Select at least one day first");
      return;
    }
    const name = window.prompt("Calendar name (e.g. F4 Italian 2027)");
    if (!name) return;
    setSaving(true);
    try {
      await save({ data: { name, events: daysToEvents(value), dates: value, source: "manual" } });
      toast.success("Calendar saved to your archive");
      qc.invalidateQueries({ queryKey: ["my-calendars"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) pickCalendar(e.target.value);
          e.target.value = "";
        }}
        className="border border-border bg-background px-3 py-2 font-mono text-[10px] uppercase tracking-widest"
      >
        <option value="">Use one of my calendars…</option>
        {(data?.mine ?? []).length > 0 && (
          <optgroup label="My archive">
            {data!.mine.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
        {(data?.shared ?? []).length > 0 && (
          <optgroup label="Platform calendars">
            {data!.shared.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
        <Upload className="size-3.5" /> Import .ics file
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        className={btn}
        onClick={() => {
          const events = daysToEvents(value);
          if (!events.length) {
            const today = new Date();
            toast.message("Select at least one day (or import a calendar) to build the rule", {
              description: `Tip: pick the race day of each round, e.g. ${isoOf(today)}`,
            });
            return;
          }
          setQuickEvents(events);
        }}
      >
        <ListChecks className="size-3.5" /> Quick fill (Mon → Mon rule)
      </button>

      <button type="button" className={btn} onClick={saveCurrent} disabled={saving}>
        <Save className="size-3.5" /> {saveLabel}
      </button>

      <Link to="/dashboard/calendars" className={btn}>
        <CalendarRange className="size-3.5" /> Manage calendars
      </Link>

      {quickEvents && (
        <CalendarQuickFillDialog
          open={!!quickEvents}
          onOpenChange={(v) => !v && setQuickEvents(null)}
          events={quickEvents}
          onApply={(dates) => onChange(dates)}
        />
      )}
    </div>
  );
}
