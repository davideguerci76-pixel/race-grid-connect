import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addDaysIso, mondayOf, type CalendarEventItem } from "@/lib/ics";

const SLOTS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon +1"];
const DEFAULT_RULE = [false, false, false, false, true, true, true, false];

function datesForEvent(ev: CalendarEventItem, rule: boolean[]): string[] {
  const anchor = mondayOf(ev.start);
  return rule.map((on, i) => (on ? addDaysIso(anchor, i) : null)).filter((d): d is string => !!d);
}

function SlotRow({ rule, onToggle, compact }: { rule: boolean[]; onToggle: (i: number) => void; compact?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {SLOTS.map((s, i) => (
        <button
          key={s}
          type="button"
          onClick={() => onToggle(i)}
          className={`border px-2 py-1 font-mono uppercase tracking-widest ${compact ? "text-[9px]" : "text-[10px]"} ${
            rule[i] ? "border-[#16a34a] bg-[#16a34a]/15 text-[#16a34a]" : "border-border text-muted-foreground hover:border-racing-red hover:text-racing-red"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export type ApplyMode = "replace" | "merge";

export function CalendarQuickFillDialog({
  open,
  onOpenChange,
  events,
  title,
  onApply,
  showMode = false,
  existingCount = 0,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  events: CalendarEventItem[];
  title?: string;
  onApply: (dates: string[], mode: ApplyMode) => void;
  showMode?: boolean;
  existingCount?: number;
}) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("sweep_public.calendar_quick_fill.default_title");
  const [rule, setRule] = useState<boolean[]>(DEFAULT_RULE);
  const [perEvent, setPerEvent] = useState<Record<number, boolean[]>>({});
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<ApplyMode>("merge");

  const effective = (i: number) => perEvent[i] ?? rule;

  const result = useMemo(() => {
    const set = new Set<string>();
    events.forEach((ev, i) => datesForEvent(ev, effective(i)).forEach((d) => set.add(d)));
    return [...set].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, rule, perEvent]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">{resolvedTitle}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          {t(events.length === 1 ? "sweep_public.calendar_quick_fill.description" : "sweep_public.calendar_quick_fill.description_plural", { count: events.length })}
        </p>

        <div className="border border-border bg-card p-4">
          <div className="label-mono">{t("sweep_public.calendar_quick_fill.standard_week_label")}</div>
          <div className="mt-2">
            <SlotRow rule={rule} onToggle={(i) => setRule(rule.map((v, j) => (j === i ? !v : v)))} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPerEvent({})}
              className="border border-border px-3 py-1 text-[10px] font-bold uppercase tracking-widest hover:border-racing-red hover:text-racing-red"
            >
              {t("sweep_public.calendar_quick_fill.apply_to_all")}
            </button>
            <button
              type="button"
              onClick={() => setRule(DEFAULT_RULE)}
              className="border border-border px-3 py-1 text-[10px] font-bold uppercase tracking-widest hover:border-racing-red hover:text-racing-red"
            >
              {t("sweep_public.calendar_quick_fill.reset_weekend_default")}
            </button>
          </div>
        </div>

        <div className="border border-border bg-card p-4">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="label-mono hover:text-racing-red"
          >
            {t("sweep_public.calendar_quick_fill.fine_tune_toggle", { action: expanded ? t("sweep_public.calendar_quick_fill.hide") : t("sweep_public.calendar_quick_fill.fine_tune"), count: events.length })}
          </button>
          {expanded && (
            <div className="mt-3 space-y-3">
              {events.map((ev, i) => (
                <div key={`${ev.start}-${i}`} className="border-b border-border/60 pb-3 last:border-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs font-bold uppercase">{ev.title}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {ev.start}
                      {ev.end !== ev.start ? ` → ${ev.end}` : ""}
                    </span>
                  </div>
                  <div className="mt-2">
                    <SlotRow
                      compact
                      rule={effective(i)}
                      onToggle={(slot) => {
                        const cur = effective(i);
                        setPerEvent({ ...perEvent, [i]: cur.map((v, j) => (j === slot ? !v : v)) });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showMode && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="label-mono">{t("sweep_public.calendar_quick_fill.replace_or_merge")}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["replace", "merge"] as ApplyMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`border px-3 py-2 text-[11px] font-bold uppercase tracking-widest ${
                    mode === m ? "border-racing-red bg-racing-red/15 text-racing-red" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "replace" ? t("sweep_public.calendar_quick_fill.replace") : t("sweep_public.calendar_quick_fill.merge")}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              <span dangerouslySetInnerHTML={{ __html: t("sweep_public.calendar_quick_fill.replace_desc", { count: existingCount }) }} />
              <br />
              <span dangerouslySetInnerHTML={{ __html: t("sweep_public.calendar_quick_fill.merge_desc") }} />
            </p>
          </div>
        )}

        <div className="font-mono text-xs text-racing-red">
          {mode === "merge" && showMode
            ? t("sweep_public.calendar_quick_fill.days_will_be_added", { count: result.length })
            : t("sweep_public.calendar_quick_fill.days_will_be_selected", { count: result.length })}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="border border-border px-4 py-2 text-[11px] font-bold uppercase tracking-widest hover:border-racing-red hover:text-racing-red"
          >
            {t("sweep_public.calendar_quick_fill.cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(result, mode);
              onOpenChange(false);
            }}
            className="bg-racing-red px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white hover:brightness-110"
          >
            {showMode
              ? mode === "replace"
                ? t("sweep_public.calendar_quick_fill.confirm_replace", { count: result.length })
                : t("sweep_public.calendar_quick_fill.confirm_merge", { count: result.length })
              : t("sweep_public.calendar_quick_fill.apply_days", { count: result.length })}
          </button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
