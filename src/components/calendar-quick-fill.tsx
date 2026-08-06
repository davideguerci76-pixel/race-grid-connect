import { useMemo, useState } from "react";
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

export function CalendarQuickFillDialog({
  open,
  onOpenChange,
  events,
  title = "Quick fill — logistics rule",
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  events: CalendarEventItem[];
  title?: string;
  onApply: (dates: string[]) => void;
}) {
  const [rule, setRule] = useState<boolean[]>(DEFAULT_RULE);
  const [perEvent, setPerEvent] = useState<Record<number, boolean[]>>({});
  const [expanded, setExpanded] = useState(false);

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
          <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">{title}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Set your standard logistics week (Monday → Monday). Friday, Saturday and Sunday are preselected — adjust them (e.g. leave on Wednesday, return on
          Monday) and apply the rule to all {events.length} event{events.length === 1 ? "" : "s"} in one click. You can still fine-tune single rounds below.
        </p>

        <div className="border border-border bg-card p-4">
          <div className="label-mono">[STANDARD WEEK — APPLIED TO ALL EVENTS]</div>
          <div className="mt-2">
            <SlotRow rule={rule} onToggle={(i) => setRule(rule.map((v, j) => (j === i ? !v : v)))} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPerEvent({})}
              className="border border-border px-3 py-1 text-[10px] font-bold uppercase tracking-widest hover:border-racing-red hover:text-racing-red"
            >
              Apply to all events
            </button>
            <button
              type="button"
              onClick={() => setRule(DEFAULT_RULE)}
              className="border border-border px-3 py-1 text-[10px] font-bold uppercase tracking-widest hover:border-racing-red hover:text-racing-red"
            >
              Reset weekend default
            </button>
          </div>
        </div>

        <div className="border border-border bg-card p-4">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="label-mono hover:text-racing-red"
          >
            [{expanded ? "HIDE" : "FINE-TUNE"} SINGLE EVENTS ({events.length})]
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

        <div className="font-mono text-xs text-racing-red">{result.length} day(s) will be selected</div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="border border-border px-4 py-2 text-[11px] font-bold uppercase tracking-widest hover:border-racing-red hover:text-racing-red"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(result);
              onOpenChange(false);
            }}
            className="bg-racing-red px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white hover:brightness-110"
          >
            Apply {result.length} days
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
