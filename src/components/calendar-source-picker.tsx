import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarRange, Upload, Save, ListChecks } from "lucide-react";
import { listMyCalendars, saveCalendar, type UserCalendar } from "@/lib/calendars.functions";
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
  saveLabel,
  className,
}: {
  value: string[]; // ISO days
  onChange: (dates: string[]) => void;
  saveLabel?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const resolvedSaveLabel = saveLabel ?? t("sweep_public.calendar_source_picker.save_as_my_calendar");
  const qc = useQueryClient();
  const list = useServerFn(listMyCalendars);
  const save = useServerFn(saveCalendar);
  const fileRef = useRef<HTMLInputElement>(null);
  const [quickEvents, setQuickEvents] = useState<CalendarEventItem[] | null>(null);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({ queryKey: ["my-calendars"], queryFn: () => list() });
  const mine: UserCalendar[] = data?.mine ?? [];
  const shared: UserCalendar[] = data?.shared ?? [];
  const options: UserCalendar[] = [...mine, ...shared];

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const events = parseIcs(text);
      if (!events.length) {
        toast.error(t("sweep_public.calendar_source_picker.no_events_in_ics"));
        return;
      }
      setQuickEvents(events);
    } catch {
      toast.error(t("sweep_public.calendar_source_picker.could_not_read_ics"));
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
      toast.error(t("sweep_public.calendar_source_picker.select_day_first"));
      return;
    }
    const name = window.prompt(t("sweep_public.calendar_source_picker.name_prompt"));
    if (!name) return;
    setSaving(true);
    try {
      await save({ data: { name, events: daysToEvents(value), dates: value, source: "manual" } });
      toast.success(t("sweep_public.calendar_source_picker.calendar_saved"));
      qc.invalidateQueries({ queryKey: ["my-calendars"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sweep_public.calendar_source_picker.save_failed"));
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
        <option value="">{t("sweep_public.calendar_source_picker.use_calendar_placeholder")}</option>
        {mine.length > 0 && (
          <optgroup label={t("sweep_public.calendar_source_picker.my_archive_group")}>
            {mine.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
        {shared.length > 0 && (
          <optgroup label={t("sweep_public.calendar_source_picker.platform_calendars_group")}>
            {shared.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
        <Upload className="size-3.5" /> {t("sweep_public.calendar_source_picker.import_ics")}
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
            toast.message(t("sweep_public.calendar_source_picker.select_day_tip_title"), {
              description: t("sweep_public.calendar_source_picker.select_day_tip_desc", { date: isoOf(today) }),
            });
            return;
          }
          setQuickEvents(events);
        }}
      >
        <ListChecks className="size-3.5" /> {t("sweep_public.calendar_source_picker.quick_fill_button")}
      </button>

      <button type="button" className={btn} onClick={saveCurrent} disabled={saving}>
        <Save className="size-3.5" /> {resolvedSaveLabel}
      </button>

      <Link to="/dashboard/calendars" className={btn}>
        <CalendarRange className="size-3.5" /> {t("sweep_public.calendar_source_picker.manage_calendars")}
      </Link>

      {quickEvents && (
        <CalendarQuickFillDialog
          open={!!quickEvents}
          onOpenChange={(v) => !v && setQuickEvents(null)}
          events={quickEvents}
          showMode
          existingCount={value.length}
          onApply={(dates, mode) =>
            onChange(mode === "replace" ? [...new Set(dates)].sort() : [...new Set([...value, ...dates])].sort())
          }
        />
      )}
    </div>
  );
}
