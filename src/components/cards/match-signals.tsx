import { useTranslation } from "react-i18next";
import { CalendarX, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCriterion } from "@/lib/criteria-label";
import { Chip, Chips } from "@/components/cards/primitives";

/**
 * Two independent match dimensions, always rendered separately:
 *  - PROFESSIONAL RELEVANCE (skills_score / match_score, %)
 *  - TEMPORAL COVERAGE (Full = 100% of required days, Partial = ≥50%, per 0104 law)
 * Nothing here recomputes anything: values come straight from the server payload.
 */

export function RelevanceScore({ pct, perfect = false, size = "lg", className }: { pct: number; perfect?: boolean; size?: "lg" | "md" | "sm"; className?: string }) {
  const { t } = useTranslation();
  const n = size === "lg" ? "text-[40px] @lg:text-[46px]" : size === "md" ? "text-[28px]" : "text-[20px]";
  return (
    <div className={cn("text-right", className)}>
      <div className={cn("font-black italic leading-none tracking-tighter", n, perfect ? "text-racing-yellow" : "text-foreground")}>{pct}%</div>
      <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
        {perfect ? t("cards.relevance_perfect") : t("cards.relevance")}
      </div>
    </div>
  );
}

export type CoverageInput = {
  isPartial: boolean;
  overlapDays: number | null | undefined;
  missingDays: number | null | undefined;
  missingDates: string[];
  /** Server flag: gaps only at the edges of the required span vs. central gaps. */
  edgeOnly?: boolean;
};

export function coverageOf(m: any): CoverageInput {
  return {
    isPartial: !!m?.is_partial,
    overlapDays: m?.overlap_days ?? null,
    missingDays: Number(m?.missing_days ?? 0),
    missingDates: Array.isArray(m?.missing_dates) ? m.missing_dates.filter((d: unknown) => typeof d === "string") : [],
    edgeOnly: m?.edge_only !== false,
  };
}

/** Header-level coverage statement: "Full match · 3 of 3 days" / "Partial match · 2 of 3 days". */
export function useCoverageText(c: CoverageInput) {
  const { t } = useTranslation();
  const covered = Number(c.overlapDays ?? 0);
  const missing = Number(c.missingDays ?? 0);
  const required = covered + missing;
  const title = c.isPartial ? t("mcard.label_partial") : t("mcard.label_full");
  const days = required > 0 ? t("cards.days_of", { covered, required }) : t("mcard.days_available", { count: covered });
  return { title, days, covered, missing, required };
}

/** Missing-days block: the one and only place the missing dates list is printed on a card. */
export function MissingDays({ c, compact = false }: { c: CoverageInput; compact?: boolean }) {
  const { t } = useTranslation();
  const missing = Number(c.missingDays ?? 0);
  if (!c.isPartial || missing <= 0) return null;
  const gapLabel = c.edgeOnly ? t("sweep_engage.request_matches.gap_edge_only") : t("sweep_engage.request_matches.gap_central");
  return (
    <div className={cn("rounded-lg border border-racing-yellow/50 bg-racing-yellow/5 px-3 py-2", compact && "py-1.5")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-bold text-racing-yellow">
        <CalendarX className="size-4" />
        {t(missing === 1 ? "cards.missing_day_one" : "cards.missing_day_other", { count: missing })}
        <span className="font-normal text-muted-foreground">· {gapLabel}</span>
      </div>
      {c.missingDates.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {c.missingDates.map((day) => (
            <time key={day} dateTime={day} className="rounded border border-racing-yellow/40 bg-racing-yellow/10 px-2 py-0.5 font-mono text-[11px] text-racing-yellow">
              {day}
            </time>
          ))}
        </div>
      )}
    </div>
  );
}

/** Rank / tier pill (marketplace position — kept, but demoted under identity). */
export function RankPill({ rank, tier }: { rank?: number | string | null; tier?: number | string | null }) {
  const { t } = useTranslation();
  if (rank == null) return null;
  return (
    <span className="inline-flex flex-col items-center rounded-lg border border-racing-yellow/60 px-2.5 py-1 text-center leading-tight text-racing-yellow">
      <b className="text-[15px] font-black">#{rank}</b>
      <span className="font-mono text-[9px] uppercase tracking-widest">{tier != null ? t("cards.tier_n", { tier }) : t("sweep_engage.matches.rank_label", { defaultValue: "Rank" })}</span>
    </span>
  );
}

/**
 * Criteria outcome. Hard = mandatory requirement missing; soft = preferred missing.
 * Rendered once per card (no summary + expanded duplicate).
 */
export function CriteriaOutcome({ missing, allOkText }: { missing: any[]; allOkText?: string }) {
  const { t } = useTranslation();
  const hard = missing.filter((c: any) => c?.hard);
  const soft = missing.filter((c: any) => !c?.hard);
  if (hard.length === 0 && soft.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-[13px] text-success">
        <CheckCircle2 className="size-4" /> {allOkText ?? t("mcard.all_hard_met")}
      </div>
    );
  }
  return (
    <div className="grid gap-1.5">
      {hard.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[12.5px] font-bold text-racing-red">
            <XCircle className="size-4" /> {t("cards.hard_missing_title")}
          </div>
          <Chips>{hard.map((c: any, i: number) => <Chip key={`h${i}`} tone="hard">{formatCriterion(c, t)}</Chip>)}</Chips>
        </div>
      )}
      {soft.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[12.5px] font-bold text-racing-yellow">
            <CircleDashed className="size-4" /> {t("cards.soft_missing_title")}
          </div>
          <Chips>{soft.map((c: any, i: number) => <Chip key={`s${i}`} tone="soft">{formatCriterion(c, t)}</Chip>)}</Chips>
        </div>
      )}
    </div>
  );
}
