import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listMyCalendars, type UserCalendar } from "@/lib/calendars.functions";
import { addDaysIso, daysToEvents, mondayOf, parseIcs, type CalendarEventItem } from "@/lib/ics";

const SLOTS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon +1"];
const DEFAULT_RULE = [false, false, false, false, true, true, true, false];

const btn =
  "inline-flex items-center gap-2 border border-border bg-background px-3 py-2 font-mono text-[10px] uppercase tracking-widest hover:border-racing-red hover:text-racing-red transition-colors disabled:opacity-40";
const btnPrimary =
  "inline-flex items-center gap-2 bg-racing-red px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-40";

export type AddSource = { name: string; events: CalendarEventItem[]; days: string[] };

export function applyWeekRule(events: CalendarEventItem[], rule: boolean[]): string[] {
  const set = new Set<string>();
  for (const ev of events) {
    const anchor = mondayOf(ev.start);
    rule.forEach((on, i) => on && set.add(addDaysIso(anchor, i)));
  }
  return [...set].sort();
}

function SlotRow({ rule, onToggle }: { rule: boolean[]; onToggle: (i: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {SLOTS.map((s, i) => (
        <button
          key={s}
          type="button"
          onClick={() => onToggle(i)}
          className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${
            rule[i]
              ? "border-[#16a34a] bg-[#16a34a]/15 text-[#16a34a]"
              : "border-border text-muted-foreground hover:border-racing-red hover:text-racing-red"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

/**
 * Unified "Add from calendar" flow: pick a source (saved calendar, platform
 * calendar or .ics file), choose AVAILABLE or BUSY, optionally refine with the
 * Mon → Mon rule, then confirm (with an explicit add/remove preview on Replace).
 */
export function CalendarAddDialog({
  open,
  onOpenChange,
  currentAvailable,
  protectedDays,
  onApplyAvailable,
  onApplyBusy,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentAvailable: string[];
  protectedDays: Set<string>;
  onApplyAvailable: (dates: string[], mode: "merge" | "replace") => void;
  onApplyBusy: (dates: string[], label: string) => void;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  const listCals = useServerFn(listMyCalendars);
  const { data } = useQuery({ queryKey: ["my-calendars"], queryFn: () => listCals(), enabled: open });
  const mine: UserCalendar[] = data?.mine ?? [];
  const shared: UserCalendar[] = data?.shared ?? [];

  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<AddSource | null>(null);
  const [intent, setIntent] = useState<"available" | "busy" | null>(null);
  const [label, setLabel] = useState("");
  const [refine, setRefine] = useState(false);
  const [rule, setRule] = useState<boolean[]>(DEFAULT_RULE);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [confirmReplace, setConfirmReplace] = useState(false);

  const reset = () => {
    setSource(null);
    setIntent(null);
    setLabel("");
    setRefine(false);
    setRule(DEFAULT_RULE);
    setMode("merge");
    setConfirmReplace(false);
  };

  const close = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const pickCalendar = (id: string) => {
    const cal = [...mine, ...shared].find((c) => c.id === id);
    if (!cal) return;
    const events = cal.events?.length ? cal.events : daysToEvents(cal.dates);
    setSource({ name: cal.name, events, days: [...new Set(cal.dates)].sort() });
    setLabel(cal.name);
  };

  const handleFile = async (file: File) => {
    try {
      const events = parseIcs(await file.text());
      if (!events.length) {
        toast.error(t("pcal.add.no_events", { defaultValue: "No events found in this .ics file." }));
        return;
      }
      const days = new Set<string>();
      for (const ev of events) {
        let cur = ev.start;
        let guard = 0;
        while (cur <= ev.end && guard < 400) {
          days.add(cur);
          cur = addDaysIso(cur, 1);
          guard += 1;
        }
      }
      const name = file.name.replace(/\.ics$/i, "");
      setSource({ name, events, days: [...days].sort() });
      setLabel(name);
    } catch {
      toast.error(t("pcal.add.ics_failed", { defaultValue: "Could not read this .ics file." }));
    }
  };

  const resultDays = useMemo(() => {
    if (!source) return [];
    const base = refine ? applyWeekRule(source.events, rule) : source.days;
    return base.filter((d) => !protectedDays.has(d));
  }, [source, refine, rule, protectedDays]);

  const skipped = useMemo(() => {
    if (!source) return 0;
    const base = refine ? applyWeekRule(source.events, rule) : source.days;
    return base.filter((d) => protectedDays.has(d)).length;
  }, [source, refine, rule, protectedDays]);

  const preview = useMemo(() => {
    const current = new Set(currentAvailable.filter((d) => !protectedDays.has(d)));
    const next = new Set(resultDays);
    if (mode === "merge") {
      return { added: resultDays.filter((d) => !current.has(d)).length, removed: 0 };
    }
    return {
      added: [...next].filter((d) => !current.has(d)).length,
      removed: [...current].filter((d) => !next.has(d)).length,
    };
  }, [currentAvailable, resultDays, mode, protectedDays]);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">
            {t("pcal.add.title", { defaultValue: "Add from calendar" })}
          </DialogTitle>
        </DialogHeader>

        {/* 1 — source */}
        <div className="border border-border bg-card p-4">
          <div className="label-mono">[1] {t("pcal.add.step_source", { defaultValue: "Choose a source" })}</div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <select
              value=""
              onChange={(e) => e.target.value && pickCalendar(e.target.value)}
              className="w-full min-w-0 border border-border bg-background px-3 py-2 font-mono text-[10px] uppercase tracking-widest"
            >
              <option value="">{t("pcal.add.pick_calendar", { defaultValue: "Saved or platform calendar…" })}</option>
              {mine.length > 0 && (
                <optgroup label={t("pcal.add.group_mine", { defaultValue: "My saved calendars" })}>
                  {mine.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              )}
              {shared.length > 0 && (
                <optgroup label={t("pcal.add.group_shared", { defaultValue: "Platform / shared calendars" })}>
                  {shared.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
              <Upload className="size-3.5" /> {t("pcal.add.import_ics", { defaultValue: "Import .ics" })}
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
          </div>
          {source && (
            <div className="mt-3 break-words font-mono text-[11px] text-muted-foreground">
              {source.name} · {t("pcal.add.source_summary", { defaultValue: "{{events}} event(s), {{days}} day(s)", events: source.events.length, days: source.days.length })}
            </div>
          )}
        </div>

        {/* 2 — intent */}
        {source && (
          <div className="border border-border bg-card p-4">
            <div className="label-mono">[2] {t("pcal.add.step_intent", { defaultValue: "What do you want to do?" })}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIntent("available")}
                className={`border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest ${
                  intent === "available" ? "border-[#16a34a] bg-[#16a34a]/15 text-[#16a34a]" : "border-border text-muted-foreground"
                }`}
              >
                {t("pcal.add.mark_available", { defaultValue: "Mark as available" })}
              </button>
              <button
                type="button"
                onClick={() => setIntent("busy")}
                className={`border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest ${
                  intent === "busy" ? "border-racing-red bg-racing-red/15 text-racing-red" : "border-border text-muted-foreground"
                }`}
              >
                {t("pcal.add.mark_busy", { defaultValue: "Mark as busy" })}
              </button>
            </div>
            {intent === "busy" && (
              <div className="mt-3">
                <label className="label-mono">{t("pcal.add.busy_label", { defaultValue: "Private note used on those days" })}</label>
                <input
                  value={label}
                  maxLength={60}
                  onChange={(e) => setLabel(e.target.value)}
                  className="mt-1 w-full min-w-0 border border-border bg-background px-3 py-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{t("pcal.busy_hint")}</p>
              </div>
            )}
          </div>
        )}

        {/* 3 — optional refinement */}
        {source && intent && (
          <div className="border border-border bg-card p-4">
            <button type="button" className="label-mono hover:text-racing-red" onClick={() => setRefine(!refine)}>
              [3] {t("pcal.add.step_refine", { defaultValue: "Optional: refine each event with a Mon → Mon rule" })}
            </button>
            {refine && (
              <div className="mt-3 space-y-2">
                <SlotRow rule={rule} onToggle={(i) => setRule(rule.map((v, j) => (j === i ? !v : v)))} />
                <button type="button" className={btn} onClick={() => setRule(DEFAULT_RULE)}>
                  {t("pcal.add.reset_rule", { defaultValue: "Reset weekend default" })}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 4 — apply */}
        {source && intent && (
          <div className="border border-border bg-card p-4">
            <div className="label-mono">[4] {t("pcal.add.step_apply", { defaultValue: "Review and apply" })}</div>
            {intent === "available" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(["merge", "replace"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setConfirmReplace(false);
                    }}
                    className={`border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest ${
                      mode === m ? "border-racing-red bg-racing-red/15 text-racing-red" : "border-border text-muted-foreground"
                    }`}
                  >
                    {m === "merge" ? t("pcal.add.merge", { defaultValue: "Merge" }) : t("pcal.add.replace", { defaultValue: "Replace all" })}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 space-y-1 font-mono text-[11px]">
              {intent === "available" ? (
                <>
                  <div className="text-[#16a34a]">+ {t("pcal.add.will_add", { defaultValue: "{{count}} day(s) added", count: preview.added })}</div>
                  <div className={preview.removed ? "text-racing-red" : "text-muted-foreground"}>
                    − {t("pcal.add.will_remove", { defaultValue: "{{count}} day(s) removed", count: preview.removed })}
                  </div>
                </>
              ) : (
                <div className="text-racing-red">{t("pcal.add.will_busy", { defaultValue: "{{count}} day(s) marked busy", count: resultDays.length })}</div>
              )}
              {skipped > 0 && (
                <div className="text-muted-foreground">
                  {t("pcal.add.protected_skipped", { defaultValue: "{{count}} PITCALL day(s) protected and skipped", count: skipped })}
                </div>
              )}
            </div>

            {intent === "available" && mode === "replace" && preview.removed > 0 && (
              <label className="mt-3 flex items-start gap-2 border border-racing-yellow/60 bg-racing-yellow/10 p-3 text-[11px]">
                <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} className="mt-0.5" />
                <span>
                  {t("pcal.add.replace_warning", {
                    defaultValue: "I understand {{count}} available day(s), including days in other months or years, will be removed.",
                    count: preview.removed,
                  })}
                </span>
              </label>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className={btn} onClick={() => close(false)}>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={
                  pending ||
                  !resultDays.length ||
                  (intent === "busy" && !label.trim()) ||
                  (intent === "available" && mode === "replace" && preview.removed > 0 && !confirmReplace)
                }
                onClick={() => {
                  if (intent === "available") onApplyAvailable(resultDays, mode);
                  else onApplyBusy(resultDays, label.trim());
                  close(false);
                }}
              >
                {t("pcal.add.apply", { defaultValue: "Apply" })}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
