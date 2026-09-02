import { useTranslation } from "react-i18next";
import { MapPin, ListChecks, Wallet, Lock } from "lucide-react";
import { skillLabel, educationLabel, languageLabel, disciplineLabel } from "@/lib/paddock";
import { levelLabel } from "@/lib/roles";

type Detail = {
  logistics: Record<string, any>;
  requirements: Record<string, any>;
  economics: Record<string, any>;
  candidates: { total: number; rank: number } | null;
};

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-racing-yellow/25 bg-background/40 p-3">
      <div className="label-mono mb-2 flex items-center gap-2 text-racing-yellow">{icon} {title}</div>
      <div className="grid gap-1.5 text-xs">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Chips({ items, hard }: { items: string[]; hard?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((s, i) => (
        <span
          key={i}
          className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${hard ? "border-racing-red text-racing-red" : "border-border text-muted-foreground"}`}
        >
          {s}
        </span>
      ))}
    </div>
  );
}

/** Locked teaser shown before the 1-token reveal. */
export function PitCallRevealTeaser({ detailCount }: { detailCount?: number }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 border border-dashed border-border bg-background/40 p-3">
      <div className="label-mono mb-1 flex items-center gap-2 text-muted-foreground"><Lock className="size-3" /> {t("reveal.locked_title")}</div>
      <p className="text-xs text-muted-foreground">{t("reveal.locked_body")}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {[t("reveal.logistics"), t("reveal.requirements"), t("reveal.economics")].map((s) => (
          <span key={s} className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground blur-[0.4px]">
            {s}
          </span>
        ))}
      </div>
      {typeof detailCount === "number" && detailCount > 0 && (
        <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-racing-yellow">{t("reveal.locked_count", { count: detailCount })}</div>
      )}
    </div>
  );
}

/** Everything the single 1-token reveal unlocks. No team identity, ever. */
export function PitCallRevealDetail({ detail }: { detail: Detail | null }) {
  const { t } = useTranslation();
  if (!detail) return null;
  const { logistics: l, requirements: r, economics: e, candidates } = detail;

  const place = [l.location_city, l.location_region, l.location_country].filter(Boolean).join(", ") || l.location || null;
  const langs: any[] = Array.isArray(r.languages) ? r.languages : [];
  const exps: any[] = Array.isArray(r.experience_requirements) ? r.experience_requirements : [];
  const currency = e.currency === "EUR" || !e.currency ? "€" : `${e.currency} `;
  const hasBudget = e.budget_min != null || e.budget_max != null;

  return (
    <div className="mt-3 border-l-2 border-racing-yellow bg-racing-yellow/5 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-racing-yellow">{t("reveal.unlocked_title")}</div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("reveal.identity_note")}</div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Section icon={<MapPin className="size-3" />} title={t("reveal.logistics")}>
          {place && <Row label={t("reveal.place")} value={place} />}
          {l.circuit && <Row label={t("reveal.circuit")} value={l.circuit} />}
          {l.location_radius_km != null && <Row label={t("reveal.radius")} value={`${l.location_radius_km} km`} />}
          <Row label={t("reveal.travel")} value={l.travel_required ? t("reveal.yes") : t("reveal.no")} />
          {l.duration && <Row label={t("reveal.duration")} value={t(`duration.${l.duration}`, { defaultValue: String(l.duration) })} />}
          {/* Championship Pit Calls list their real sparse required dates, never a continuous range. */}
          {seasonDates.length > 0 ? (
            <>
              <Row label={t("reveal.season_days")} value={t("championship.days_count", { count: seasonDates.length })} />
              <Row label={t("reveal.dates")} value={requiredDatesText(seasonDates)} />
            </>
          ) : (
            l.start_date && <Row label={t("reveal.dates")} value={`${l.start_date} → ${l.end_date}`} />
          )}
        </Section>

        <Section icon={<ListChecks className="size-3" />} title={t("reveal.requirements")}>
          {r.sub_role_min_level && <Row label={t("reveal.min_level")} value={levelLabel(r.sub_role_min_level)} />}
          {(r.skills_hard ?? []).length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("reveal.skills_hard")}</div>
              <Chips items={(r.skills_hard as string[]).map(skillLabel)} hard />
            </div>
          )}
          {(r.skills ?? []).length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("reveal.skills_soft")}</div>
              <Chips items={(r.skills as string[]).map(skillLabel)} />
            </div>
          )}
          {(r.education ?? []).length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("reveal.education")}</div>
              <Chips items={(r.education as string[]).map(educationLabel)} />
            </div>
          )}
          {langs.length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("reveal.languages")}</div>
              <Chips items={langs.map((x) => `${languageLabel(x.code, x.custom)} ${x.level ?? ""}${x.hard ? " ·" : ""}`)} />
            </div>
          )}
          {exps.length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("reveal.experience")}</div>
              <Chips items={exps.map((x) => `${disciplineLabel(x.discipline)} ${x.min_years}+ ${t("reveal.years")}`)} />
            </div>
          )}
          {r.notes && <div className="mt-1 text-muted-foreground">{r.notes}</div>}
        </Section>

        <Section icon={<Wallet className="size-3" />} title={t("reveal.economics")}>
          {hasBudget ? (
            <>
              <Row
                label={t("reveal.budget")}
                value={
                  <span className="text-base font-black text-racing-yellow">
                    {currency}
                    {e.budget_min ?? "—"}
                    {e.budget_max != null ? ` – ${currency}${e.budget_max}` : ""}
                    <span className="ml-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      /{t(`reveal.unit_${e.budget_unit ?? "day"}`, { defaultValue: e.budget_unit ?? "" })}
                    </span>
                  </span>
                }
              />
              {e.my_day_rate != null && <Row label={t("reveal.my_rate")} value={`${currency}${e.my_day_rate}`} />}
              {e.rate_fit && (
                <div
                  className={`font-mono text-[10px] uppercase tracking-widest ${e.rate_fit === "inside" ? "text-racing-yellow" : "text-racing-red"}`}
                >
                  {t(`reveal.rate_${e.rate_fit}`)}
                </div>
              )}
            </>
          ) : (
            <div className="text-muted-foreground">{t("reveal.no_budget")}</div>
          )}
          {candidates && candidates.total > 1 && (
            <Row label={t("reveal.position")} value={t("reveal.position_value", { rank: candidates.rank, total: candidates.total })} />
          )}
        </Section>
      </div>
    </div>
  );
}
