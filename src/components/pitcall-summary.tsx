import { useTranslation } from "react-i18next";
import { CalendarDays, MapPin, Wrench, Flag, Wallet, Languages as LanguagesIcon, GraduationCap, Plane, ShieldAlert, StickyNote } from "lucide-react";
import { disciplineLabel, educationLabel, languageLabel, languageLevelLabel, skillLabel } from "@/lib/paddock";
import { levelLabel, roleGroupLabel, subRoleLabel } from "@/lib/roles";
import { PoolBadge } from "@/components/pool-badge";

type AnyRequest = Record<string, any>;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function daysBetween(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const start = new Date(`${a}T00:00:00`).getTime();
  const end = new Date(`${b}T00:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

/** One key fact: small uppercase label + a large, high-contrast value. */
function Fact({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 border-l-2 border-racing-red/60 pl-3">
      <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        <span className="text-racing-red">{icon}</span>
        {label}
      </div>
      <div className="mt-1 break-words text-base font-bold leading-snug text-foreground sm:text-lg">{value}</div>
      {sub ? <div className="mt-0.5 break-words text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "hard" }) {
  return (
    <span
      className={
        tone === "hard"
          ? "inline-flex items-center border border-racing-red/70 bg-racing-red/10 px-2 py-0.5 text-xs font-semibold text-racing-red"
          : "inline-flex items-center border border-border bg-secondary px-2 py-0.5 text-xs text-foreground"
      }
    >
      {children}
    </span>
  );
}

function Block({ icon, title, tone, children }: { icon: React.ReactNode; title: string; tone?: "hard"; children: React.ReactNode }) {
  return (
    <div className={tone === "hard" ? "border border-racing-red/40 bg-racing-red/[0.06] p-3" : "border border-border bg-background/40 p-3"}>
      <div className={`flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest ${tone === "hard" ? "text-racing-red" : "text-muted-foreground"}`}>
        {icon}
        {title}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/**
 * Team-side header for a Pit Call: everything the team declared in the request,
 * grouped so it reads in ~2 seconds and stays visually distinct from match results.
 */
export function PitCallSummary({ request }: { request: AnyRequest }) {
  const { t } = useTranslation();
  const r = request ?? {};

  const isSeason = r.duration === "full_season";
  const seasonDates: string[] = Array.isArray(r.season_dates) ? r.season_dates : [];
  const dayCount = isSeason ? seasonDates.length : daysBetween(r.start_date, r.end_date);

  const roleValue = r.sub_role ? subRoleLabel(r.sub_role) : roleGroupLabel(r.role_group);
  const roleSub = r.sub_role ? `${levelLabel(r.sub_role_min_level ?? "junior")}+` : null;
  const roleIsHard = Boolean(r.sub_role ? r.sub_role_hard : r.role_hard);

  const locationParts = [r.location_city, r.location_region, r.location_country].filter(Boolean);
  const locationValue = locationParts.length ? locationParts.join(", ") : r.location || r.circuit || t("sweep_engage.pitcall_summary.location_any");
  const locationSub =
    r.location_relevance === "not_relevant"
      ? t("sweep_engage.pitcall_summary.location_not_relevant")
      : r.location_radius_km
        ? t("sweep_engage.pitcall_summary.location_radius", { km: r.location_radius_km })
        : null;

  const skillsHard: string[] = Array.isArray(r.skills_hard) ? r.skills_hard : [];
  const skillsAll: string[] = Array.isArray(r.skills) ? r.skills : [];
  const skillsSoft = skillsAll.filter((s) => !skillsHard.includes(s));
  const education: string[] = Array.isArray(r.education) ? r.education : [];
  const languages: any[] = Array.isArray(r.languages) ? r.languages : [];
  const experience: any[] = Array.isArray(r.experience_requirements) ? r.experience_requirements : [];
  const hardExperience = experience.filter((e) => e?.hard);
  const softExperience = experience.filter((e) => !e?.hard);
  const hardLanguages = languages.filter((l) => l?.hard);
  const softLanguages = languages.filter((l) => !l?.hard);

  const budget =
    r.budget_min || r.budget_max
      ? `${r.budget_min ?? "—"}${r.budget_max && r.budget_max !== r.budget_min ? `–${r.budget_max}` : ""} ${r.currency ?? "EUR"} / ${t(`sweep_engage.pitcall_summary.unit_${r.budget_unit ?? "day"}`)}`
      : null;

  const hasHard = roleIsHard || skillsHard.length > 0 || hardLanguages.length > 0 || hardExperience.length > 0 || r.travel_required;
  const hasSoft = skillsSoft.length > 0 || softLanguages.length > 0 || softExperience.length > 0 || education.length > 0;

  return (
    <section className="border-2 border-racing-red/70 bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-racing-red/10 px-4 py-2 sm:px-5">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-racing-red">
          {t("sweep_engage.pitcall_summary.title")}
        </span>
        {r.search_mode === "pool" && <PoolBadge />}
        {r.status && (
          <span className="ml-auto border border-border bg-background px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {String(r.status).replace(/_/g, " ")}
          </span>
        )}
      </header>

      <div className="p-4 sm:p-5">
        <h1 className="text-2xl font-black uppercase italic leading-tight tracking-tighter sm:text-3xl">{r.title}</h1>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact
            icon={<Wrench className="size-3" />}
            label={t("sweep_engage.pitcall_summary.role")}
            value={
              <span className="inline-flex flex-wrap items-center gap-2">
                {roleValue}
                {roleIsHard && <Chip tone="hard">{t("sweep_engage.pitcall_summary.mandatory")}</Chip>}
              </span>
            }
            sub={roleSub}
          />
          <Fact icon={<Flag className="size-3" />} label={t("sweep_engage.pitcall_summary.discipline")} value={disciplineLabel(r.discipline)} />
          <Fact
            icon={<CalendarDays className="size-3" />}
            label={t("sweep_engage.pitcall_summary.dates")}
            value={isSeason ? t("sweep_engage.pitcall_summary.full_season") : `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}`}
            sub={
              isSeason
                ? t("sweep_engage.pitcall_summary.season_days", { count: dayCount, from: fmtDate(r.start_date), to: fmtDate(r.end_date) })
                : t("sweep_engage.pitcall_summary.days", { count: dayCount })
            }
          />
          <Fact icon={<MapPin className="size-3" />} label={t("sweep_engage.pitcall_summary.location")} value={locationValue} sub={locationSub} />
        </div>

        {(budget || r.circuit) && (
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-3">
            {budget && (
              <div className="flex items-center gap-2">
                <Wallet className="size-4 text-racing-yellow" />
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("sweep_engage.pitcall_summary.budget")}</span>
                <span className="text-base font-bold text-racing-yellow">{budget}</span>
              </div>
            )}
            {r.circuit && (
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Flag className="size-4 text-muted-foreground" />
                {r.circuit}
              </div>
            )}
          </div>
        )}

        {(hasHard || hasSoft) && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {hasHard && (
              <Block icon={<ShieldAlert className="size-3" />} title={t("sweep_engage.pitcall_summary.hard_requirements")} tone="hard">
                {roleIsHard && <Chip tone="hard">{roleValue}{roleSub ? ` · ${roleSub}` : ""}</Chip>}
                {skillsHard.map((s) => (
                  <Chip key={s} tone="hard">{skillLabel(s)}</Chip>
                ))}
                {hardLanguages.map((l, i) => (
                  <Chip key={`hl-${i}`} tone="hard">
                    {languageLabel(l?.code, l?.custom)} · {languageLevelLabel(l?.level)}
                  </Chip>
                ))}
                {hardExperience.map((e, i) => (
                  <Chip key={`he-${i}`} tone="hard">
                    {disciplineLabel(e?.discipline)} · {t("sweep_engage.pitcall_summary.years", { count: Number(e?.min_years ?? 0) })}
                  </Chip>
                ))}
                {r.travel_required && (
                  <Chip tone="hard">
                    <Plane className="mr-1 size-3" /> {t("sweep_engage.pitcall_summary.travel_required")}
                  </Chip>
                )}
              </Block>
            )}

            {hasSoft && (
              <Block icon={<GraduationCap className="size-3" />} title={t("sweep_engage.pitcall_summary.preferred")}>
                {skillsSoft.map((s) => (
                  <Chip key={s}>{skillLabel(s)}</Chip>
                ))}
                {softLanguages.map((l, i) => (
                  <Chip key={`sl-${i}`}>
                    <LanguagesIcon className="mr-1 size-3 text-muted-foreground" />
                    {languageLabel(l?.code, l?.custom)} · {languageLevelLabel(l?.level)}
                  </Chip>
                ))}
                {softExperience.map((e, i) => (
                  <Chip key={`se-${i}`}>
                    {disciplineLabel(e?.discipline)} · {t("sweep_engage.pitcall_summary.years", { count: Number(e?.min_years ?? 0) })}
                  </Chip>
                ))}
                {education.map((e) => (
                  <Chip key={e}>{educationLabel(e)}</Chip>
                ))}
              </Block>
            )}
          </div>
        )}

        {r.notes && (
          <div className="mt-3 border border-border bg-background/40 p-3">
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <StickyNote className="size-3" /> {t("sweep_engage.pitcall_summary.notes")}
            </div>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground">{r.notes}</p>
          </div>
        )}
      </div>
    </section>
  );
}
