import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarCheck, CalendarRange, CalendarX, Save, Settings2, Wand2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { saveCalendar } from "@/lib/calendars.functions";
import { daysToEvents } from "@/lib/ics";
import { applyWeekRule } from "@/components/calendar-add-dialog";
import { toastError } from "@/lib/errors";

const SLOTS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon +1"];
const DEFAULT_RULE = [false, false, false, false, true, true, true, false];

const btn =
  "inline-flex items-center gap-2 border border-border bg-background px-3 py-2 font-mono text-[10px] uppercase tracking-widest hover:border-racing-red hover:text-racing-red transition-colors disabled:opacity-40";
const btnPrimary =
  "inline-flex items-center gap-2 bg-racing-red px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-40";

const pad = (n: number) => String(n).padStart(2, "0");
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** All days of the given month (local time), as ISO strings. */
function monthDays(month: Date): string[] {
  const out: string[] = [];
  const d = new Date(month.getFullYear(), month.getMonth(), 1);
  while (d.getMonth() === month.getMonth()) {
    out.push(isoLocal(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Today → same day +6 months (inclusive), as ISO strings. */
function nextSixMonthsDays(): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setMonth(end.getMonth() + 6);
  while (d <= end) {
    out.push(isoLocal(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Collapsed drawer with the less frequent calendar utilities. */
export function CalendarTools({
  currentAvailable,
  protectedDays,
  onReshape,
  pending,
  month,
  canUndo,
  onUndo,
}: {
  currentAvailable: string[];
  protectedDays: Set<string>;
  onReshape: (dates: string[]) => void;
  pending?: boolean;
  month: Date;
  canUndo?: boolean;
  onUndo?: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const save = useServerFn(saveCalendar);
  const [open, setOpen] = useState(false);
  const [reshapeOpen, setReshapeOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [rule, setRule] = useState<boolean[]>(DEFAULT_RULE);
  const [confirmed, setConfirmed] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const editable = useMemo(() => currentAvailable.filter((d) => !protectedDays.has(d)), [currentAvailable, protectedDays]);
  const reshaped = useMemo(() => applyWeekRule(daysToEvents(editable), rule).filter((d) => !protectedDays.has(d)), [editable, rule, protectedDays]);
  const preview = useMemo(() => {
    const cur = new Set(editable);
    const next = new Set(reshaped);
    return {
      added: [...next].filter((d) => !cur.has(d)).length,
      removed: [...cur].filter((d) => !next.has(d)).length,
    };
  }, [editable, reshaped]);

  const [bulkConfirm, setBulkConfirm] = useState<{ scope: "month" | "six"; next: string[]; removed: number } | null>(null);

  /** Bulk availability helpers. Protected days (confirmed PITCALL / LOCKED) are never touched. */
  const bulkSelect = (days: string[]) => {
    const add = days.filter((d) => !protectedDays.has(d));
    onReshape([...new Set([...editable, ...add])].sort());
  };
  const bulkDeselect = (days: string[], scope: "month" | "six") => {
    const drop = new Set(days.filter((d) => !protectedDays.has(d)));
    const next = editable.filter((d) => !drop.has(d));
    const removed = editable.length - next.length;
    if (removed === 0) {
      toast.info(t("pcal.tools.nothing_to_remove", { defaultValue: "No available days to remove here." }));
      return;
    }
    setBulkConfirm({ scope, next, removed });
  };

  const doSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await save({ data: { name: name.trim(), events: daysToEvents(editable), dates: editable, source: "manual" } });
      toast.success(t("sweep_public.calendar_source_picker.calendar_saved"));
      qc.invalidateQueries({ queryKey: ["my-calendars"] });
      setSaveOpen(false);
      setName("");
    } catch (e) {
      toastError(e, "sweep_public.calendar_source_picker.save_failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0">
      <button type="button" className={btn} onClick={() => setOpen(!open)}>
        <Settings2 className="size-3.5" /> {t("pcal.tools.title", { defaultValue: "Calendar tools" })}
      </button>

      {open && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={pending} onClick={() => bulkSelect(monthDays(month))}>
            <CalendarCheck className="size-3.5" /> {t("pcal.tools.select_month", { defaultValue: "Select month" })}
          </button>
          <button type="button" className={btn} disabled={pending} onClick={() => bulkDeselect(monthDays(month), "month")}>
            <CalendarX className="size-3.5" /> {t("pcal.tools.deselect_month", { defaultValue: "Deselect month" })}
          </button>
          <button type="button" className={btn} disabled={pending} onClick={() => bulkSelect(nextSixMonthsDays())}>
            <CalendarCheck className="size-3.5" /> {t("pcal.tools.select_six", { defaultValue: "Select next 6 months" })}
          </button>
          <button type="button" className={btn} disabled={pending} onClick={() => bulkDeselect(nextSixMonthsDays(), "six")}>
            <CalendarX className="size-3.5" /> {t("pcal.tools.deselect_six", { defaultValue: "Deselect next 6 months" })}
          </button>
          {canUndo && (
            <button type="button" className={btn} disabled={pending} onClick={() => onUndo?.()}>
              <Undo2 className="size-3.5" /> {t("pcal.tools.undo", { defaultValue: "Undo last change" })}
            </button>
          )}
          <button type="button" className={btn} onClick={() => setReshapeOpen(true)}>
            <Wand2 className="size-3.5" /> {t("pcal.tools.reshape", { defaultValue: "Reshape my available dates (Mon → Mon)" })}
          </button>
          <button type="button" className={btn} onClick={() => setSaveOpen(true)}>
            <Save className="size-3.5" /> {t("pcal.tools.save_as_calendar", { defaultValue: "Save current availability as calendar" })}
          </button>

          <Link to="/dashboard/calendars" className={btn}>
            <CalendarRange className="size-3.5" /> {t("sweep_public.calendar_source_picker.manage_calendars")}
          </Link>
        </div>
      )}

      <Dialog open={!!bulkConfirm} onOpenChange={(v) => { if (!v) setBulkConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">
              {bulkConfirm?.scope === "six"
                ? t("pcal.tools.deselect_six", { defaultValue: "Deselect next 6 months" })
                : t("pcal.tools.deselect_month", { defaultValue: "Deselect month" })}
            </DialogTitle>
          </DialogHeader>
          <div className="font-mono text-[11px] text-racing-red">
            − {t("pcal.add.will_remove", { count: bulkConfirm?.removed ?? 0, defaultValue: "{{count}} day(s) removed" })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("pcal.tools.deselect_hint", { defaultValue: "Confirmed PITCALL and locked days are never changed." })}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={btn} onClick={() => setBulkConfirm(null)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={pending}
              onClick={() => {
                if (bulkConfirm) onReshape(bulkConfirm.next);
                setBulkConfirm(null);
              }}
            >
              {t("pcal.add.apply", { defaultValue: "Apply" })}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reshapeOpen} onOpenChange={(v) => { setReshapeOpen(v); if (!v) setConfirmed(false); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">
              {t("pcal.tools.reshape", { defaultValue: "Reshape my available dates (Mon → Mon)" })}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {t("pcal.tools.reshape_desc", {
              defaultValue: "Groups your current available dates into events and re-applies this weekly pattern. PITCALL days are never touched.",
            })}
          </p>
          <div className="flex flex-wrap gap-1">
            {SLOTS.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => setRule(rule.map((v, j) => (j === i ? !v : v)))}
                className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${
                  rule[i] ? "border-[#16a34a] bg-[#16a34a]/15 text-[#16a34a]" : "border-border text-muted-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="space-y-1 font-mono text-[11px]">
            <div className="text-[#16a34a]">+ {t("pcal.add.will_add", { count: preview.added, defaultValue: "{{count}} day(s) added" })}</div>
            <div className={preview.removed ? "text-racing-red" : "text-muted-foreground"}>
              − {t("pcal.add.will_remove", { count: preview.removed, defaultValue: "{{count}} day(s) removed" })}
            </div>
          </div>
          {preview.removed > 0 && (
            <label className="flex items-start gap-2 border border-racing-yellow/60 bg-racing-yellow/10 p-3 text-[11px]">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
              <span>{t("pcal.add.replace_warning", { count: preview.removed, defaultValue: "I understand {{count}} available day(s), including days in other months or years, will be removed." })}</span>
            </label>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={btn} onClick={() => setReshapeOpen(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={pending || (preview.removed > 0 && !confirmed)}
              onClick={() => {
                onReshape(reshaped);
                setReshapeOpen(false);
                setConfirmed(false);
              }}
            >
              {t("pcal.add.apply", { defaultValue: "Apply" })}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">
              {t("pcal.tools.save_as_calendar", { defaultValue: "Save current availability as calendar" })}
            </DialogTitle>
          </DialogHeader>
          <input
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("sweep_public.calendar_source_picker.name_prompt")}
            className="w-full min-w-0 border border-border bg-background px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            {t("pcal.tools.save_hint", { defaultValue: "{{count}} available day(s) will be stored in your archive.", count: editable.length })}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={btn} onClick={() => setSaveOpen(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
            <button type="button" className={btnPrimary} disabled={saving || !name.trim() || !editable.length} onClick={() => void doSave()}>
              {t("pcal.add.apply", { defaultValue: "Apply" })}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
