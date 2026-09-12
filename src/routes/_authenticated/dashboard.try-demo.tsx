import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Check, PlayCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { CandidateMatchCard } from "@/components/cards/candidate-match-card";
import { cardBtn } from "@/components/cards/primitives";
import { disciplineLabel, languageLabel, skillLabel } from "@/lib/paddock";
import { subRoleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * TRY A DEMO PIT CALL — guided, deterministic, 100% client-side product tour.
 *
 * This is NOT the internal admin Demo Mode (TEST seeding / scenarios A-D / SOS)
 * and NOT a real Pit Call. Nothing here imports a mutating server function:
 * no request, no match, no engagement, no token, no notification can be created
 * from this screen, by design rather than by guard.
 */

/** Required demo travel dates: 14-17 October of the next occurrence. */
function demoDates(): Date[] {
  const now = new Date();
  const year = now > new Date(now.getFullYear(), 9, 17) ? now.getFullYear() + 1 : now.getFullYear();
  return [14, 15, 16, 17].map((d) => new Date(year, 9, d));
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DEMO_SUB_ROLE = "race_engineer";
const DEMO_DISCIPLINE = "gt3";
const DEMO_LANGUAGE = "en";
const DEMO_MIN_YEARS = 3;
const DEMO_SKILL_1 = "telemetry_analysis";
const DEMO_SKILL_2 = "corner_weights_setup";

type Step =
  | "intro"
  | "role"
  | "dates"
  | "requirements"
  | "preview1"
  | "requirements2"
  | "preview2"
  | "results"
  | "end";

export const Route = createFileRoute("/_authenticated/dashboard/try-demo")({
  head: () => ({
    meta: [
      { title: "Try a Demo Pit Call — PITCALL" },
      { name: "description", content: "A two-minute guided tour: build a demo Pit Call, preview the market and read Full/Partial matches with professional relevance." },
      { property: "og:title", content: "Try a Demo Pit Call — PITCALL" },
      { property: "og:description", content: "A two-minute guided tour of how PITCALL matches motorsport professionals to your real travel dates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TryDemoPitCall,
});

function TryDemoPitCall() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const required = useMemo(() => demoDates(), []);
  const requiredKeys = useMemo(() => required.map(ymd), [required]);

  const [step, setStep] = useState<Step>("intro");
  const [role, setRole] = useState<string | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [discipline, setDiscipline] = useState<string | null>(null);
  const [years, setYears] = useState<number | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [callout, setCallout] = useState(0);

  const restart = () => {
    setStep("intro");
    setRole(null);
    setDates([]);
    setDiscipline(null);
    setYears(null);
    setLanguage(null);
    setSkills([]);
    setCallout(0);
  };

  const fmtDay = (d: Date) => new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "long" }).format(d);
  const rangeLabel = `${new Intl.DateTimeFormat(i18n.language, { day: "numeric" }).format(required[0])}–${fmtDay(required[3])}`;

  const selectedKeys = dates.map(ymd);
  const datesOk = requiredKeys.every((k) => selectedKeys.includes(k)) && selectedKeys.length === 4;
  const baseReqOk = discipline === DEMO_DISCIPLINE && years === DEMO_MIN_YEARS && language === DEMO_LANGUAGE && skills.includes(DEMO_SKILL_1);
  const secondReqOk = baseReqOk && skills.includes(DEMO_SKILL_2);

  const matches = useMemo(() => demoMatches(required), [required]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 border border-racing-yellow/60 bg-racing-yellow/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-racing-yellow">
            <Sparkles className="size-3" /> {t("trial.badge")}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={restart} className={cardBtn.secondary}>
              <RotateCcw className="size-3.5" /> {t("trial.restart")}
            </button>
            <button type="button" onClick={() => navigate({ to: "/dashboard" })} className={cardBtn.secondary}>
              <X className="size-3.5" /> {t("trial.exit")}
            </button>
          </div>
        </div>

        {step === "intro" && (
          <Panel title={t("trial.intro.title")}>
            <p className="text-muted-foreground">{t("trial.intro.body")}</p>
            <ul className="mt-3 grid gap-1 text-sm text-muted-foreground">
              <li>• {t("trial.intro.point_time")}</li>
              <li>• {t("trial.intro.point_tokens")}</li>
              <li>• {t("trial.intro.point_nobody")}</li>
            </ul>
            <Cta onClick={() => setStep("role")} label={t("trial.intro.cta")} icon={<PlayCircle className="size-4" />} />
          </Panel>
        )}

        {step === "role" && (
          <Panel title={t("trial.role.title")} hint={t("trial.role.hint", { role: subRoleLabel(DEMO_SUB_ROLE) })}>
            <Options
              options={[DEMO_SUB_ROLE, "performance_engineer", "test_engineer"].map((v) => ({ value: v, label: subRoleLabel(v) }))}
              required={DEMO_SUB_ROLE}
              selected={role ? [role] : []}
              onToggle={(v) => setRole(v === role ? null : v)}
            />
            <Done show={role === DEMO_SUB_ROLE} label={t("trial.role.done", { role: subRoleLabel(DEMO_SUB_ROLE) })} />
            <Cta onClick={() => setStep("dates")} label={t("trial.next")} disabled={role !== DEMO_SUB_ROLE} />
          </Panel>
        )}

        {step === "dates" && (
          <Panel title={t("trial.dates.title")} hint={t("trial.dates.hint", { range: rangeLabel })}>
            <div className="mt-4">
              <AvailabilityCalendar
                selected={dates}
                onSelect={(d) => setDates(d ?? [])}
                showBulkActions={false}
                legend={t("trial.dates.legend")}
                disabled={(d) => !requiredKeys.includes(ymd(d))}
              />
            </div>
            <Done show={datesOk} label={t("trial.dates.done")} />
            {datesOk && <p className="mt-2 text-sm text-muted-foreground">{t("trial.dates.note")}</p>}
            <Cta onClick={() => setStep("requirements")} label={t("trial.next")} disabled={!datesOk} />
          </Panel>
        )}

        {(step === "requirements" || step === "requirements2") && (
          <Panel
            title={t("trial.req.title")}
            hint={step === "requirements" ? t("trial.req.hint") : t("trial.req2.hint", { skill: skillLabel(DEMO_SKILL_2) })}
          >
            <Field label={t("trial.req.field_discipline")}>
              <Options
                options={["gt3", "gt4", "tcr"].map((v) => ({ value: v, label: disciplineLabel(v) }))}
                required={DEMO_DISCIPLINE}
                selected={discipline ? [discipline] : []}
                onToggle={(v) => setDiscipline(v === discipline ? null : v)}
              />
            </Field>
            <Field label={t("trial.req.field_experience")}>
              <Options
                options={[1, 3, 5].map((v) => ({ value: String(v), label: t("trial.req.years_min", { count: v }) }))}
                required={String(DEMO_MIN_YEARS)}
                selected={years ? [String(years)] : []}
                onToggle={(v) => setYears(Number(v) === years ? null : Number(v))}
              />
            </Field>
            <Field label={t("trial.req.field_language")}>
              <Options
                options={["en", "it", "de"].map((v) => ({ value: v, label: languageLabel(v) }))}
                required={DEMO_LANGUAGE}
                selected={language ? [language] : []}
                onToggle={(v) => setLanguage(v === language ? null : v)}
              />
            </Field>
            <Field label={t("trial.req.field_skills")}>
              <Options
                options={[DEMO_SKILL_1, DEMO_SKILL_2, "strategy_engineer"].map((v) => ({ value: v, label: skillLabel(v) }))}
                required={step === "requirements" ? DEMO_SKILL_1 : DEMO_SKILL_2}
                selected={skills}
                onToggle={(v) => setSkills((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
              />
            </Field>
            {step === "requirements" ? (
              <>
                <Done show={baseReqOk} label={t("trial.req.done")} />
                <Cta onClick={() => setStep("preview1")} label={t("trial.req.cta")} disabled={!baseReqOk} />
              </>
            ) : (
              <>
                <Done show={secondReqOk} label={t("trial.req2.done", { skill: skillLabel(DEMO_SKILL_2) })} />
                <Cta onClick={() => setStep("preview2")} label={t("trial.req2.cta")} disabled={!secondReqOk} />
              </>
            )}
          </Panel>
        )}

        {step === "preview1" && (
          <Panel title={t("trial.preview.title")}>
            <PreviewBox count={6} coverage={t("trial.preview.coverage_high")} tone="success" />
            <p className="mt-4 text-muted-foreground">{t("trial.preview1.hint", { skill: skillLabel(DEMO_SKILL_2) })}</p>
            <Cta onClick={() => setStep("requirements2")} label={t("trial.preview1.cta")} />
          </Panel>
        )}

        {step === "preview2" && (
          <Panel title={t("trial.preview.title")}>
            <PreviewBox count={4} coverage={t("trial.preview.coverage_targeted")} tone="warn" />
            <div className="mt-4 border border-racing-yellow/50 bg-racing-yellow/5 p-4">
              <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-racing-yellow">{t("trial.preview2.title")}</div>
              <p className="mt-2 text-muted-foreground">{t("trial.preview2.body")}</p>
            </div>
            <p className="mt-4 font-bold">{t("trial.post.lead")}</p>
            <Cta onClick={() => { setCallout(0); setStep("results"); }} label={t("trial.post.cta")} />
          </Panel>
        )}

        {step === "results" && (
          <div className="mt-8">
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">{t("trial.results.title")}</h1>
            <div className="sticky top-16 z-10 mt-4 border border-racing-red bg-card p-4 shadow-lg">
              <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-racing-red">
                {t("trial.results.callout_step", { current: callout + 1, total: 3 })}
              </div>
              <div className="mt-1 text-lg font-bold">{t(`trial.results.callout${callout + 1}.title`)}</div>
              <p className="mt-1 text-sm text-muted-foreground">{t(`trial.results.callout${callout + 1}.body`, { day: fmtDay(required[3]) })}</p>
              <div className="mt-3">
                {callout < 2 ? (
                  <button type="button" onClick={() => setCallout((c) => c + 1)} className={cardBtn.primary}>
                    {t("trial.next")}
                  </button>
                ) : (
                  <button type="button" onClick={() => setStep("end")} className={cardBtn.primary}>
                    {t("trial.results.cta_end")}
                  </button>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-4">
              {matches.map((m, i) => (
                <div
                  key={m.id}
                  className={cn(
                    "rounded-xl transition-shadow",
                    (callout === 0 && i === 0) || (callout === 1 && i === 1) || (callout === 2 && (i === 1 || i === 2))
                      ? "ring-2 ring-racing-yellow ring-offset-2 ring-offset-background"
                      : "opacity-90",
                  )}
                >
                  <CandidateMatchCard match={m} mode="request" requestFilled />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === "end" && (
          <Panel title={t("trial.end.title")}>
            <ul className="grid gap-2 text-muted-foreground">
              <li>• {t("trial.end.point_dates")}</li>
              <li>• {t("trial.end.point_preview")}</li>
              <li>• {t("trial.end.point_requirements")}</li>
              <li>• {t("trial.end.point_matches")}</li>
            </ul>
            <p className="mt-4 font-bold">{t("trial.end.preopen")}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/dashboard" className={cardBtn.primary}>{t("trial.end.cta")}</Link>
              <button type="button" onClick={restart} className={cardBtn.secondary}>
                <RotateCcw className="size-3.5" /> {t("trial.restart")}
              </button>
            </div>
          </Panel>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 border border-border bg-card p-5 sm:p-7">
      <h1 className="text-2xl font-black uppercase italic tracking-tighter sm:text-3xl">{title}</h1>
      {hint && (
        <div className="mt-3 border-l-2 border-racing-red bg-racing-red/5 px-3 py-2 text-sm font-bold">{hint}</div>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="label-mono">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Options({
  options,
  required,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  required: string;
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.value);
        const wanted = o.value === required && !on;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={cn(
              "border px-3 py-2 text-sm font-bold transition-colors",
              on ? "border-success bg-success/15 text-success" : "border-border hover:border-racing-red",
              wanted && "animate-pulse border-racing-yellow text-racing-yellow",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Done({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <div className="mt-4 inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-widest text-success">
      <Check className="size-4" /> {label}
    </div>
  );
}

function Cta({ onClick, label, disabled = false, icon }: { onClick: () => void; label: string; disabled?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="mt-6">
      <button type="button" onClick={onClick} disabled={disabled} className={cardBtn.primary}>
        {icon} {label}
      </button>
    </div>
  );
}

function PreviewBox({ count, coverage, tone }: { count: number; coverage: string; tone: "success" | "warn" }) {
  const { t } = useTranslation();
  return (
    <div className={cn("border p-5", tone === "success" ? "border-success/60 bg-success/5" : "border-racing-yellow/60 bg-racing-yellow/5")}>
      <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <CalendarDays className="size-3.5" /> {t("trial.preview.label")}
      </div>
      <div className="mt-2 text-4xl font-black italic tracking-tighter">{count}</div>
      <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("trial.preview.matchable")}</div>
      <div className={cn("mt-3 inline-block border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest", tone === "success" ? "border-success/60 text-success" : "border-racing-yellow/60 text-racing-yellow")}>
        {coverage}
      </div>
    </div>
  );
}

/** Fully synthetic demo candidates. No real freelancer identity, no DB record. */
function demoMatches(required: Date[]) {
  const d = required.map(ymd);
  const base = {
    unlocked: true,
    blurred: false,
    missing_criteria: [],
    profile: {
      role_group: "engineering",
      sub_roles: [{ sub_role: DEMO_SUB_ROLE, level: "senior" }],
      disciplines: [DEMO_DISCIPLINE],
      skills: [DEMO_SKILL_1, DEMO_SKILL_2],
      languages: [{ code: DEMO_LANGUAGE, level: "fluent" }],
      experiences: [{ discipline: DEMO_DISCIPLINE, years: 8 }],
      travels: true,
    },
  };
  return [
    {
      ...base,
      id: "demo-1",
      skills_score: 100,
      is_partial: false,
      overlap_days: 4,
      missing_days: 0,
      missing_dates: [],
      profile: { ...base.profile, display_name: "DEMO — Alex Morgan", location: "Silverstone, UK", day_rate: 620 },
    },
    {
      ...base,
      id: "demo-2",
      skills_score: 94,
      is_partial: true,
      overlap_days: 3,
      missing_days: 1,
      missing_dates: [d[3]],
      edge_only: true,
      profile: { ...base.profile, display_name: "DEMO — James Wilson", location: "Oxford, UK", day_rate: 580 },
    },
    {
      ...base,
      id: "demo-3",
      skills_score: 88,
      is_partial: false,
      overlap_days: 4,
      missing_days: 0,
      missing_dates: [],
      profile: { ...base.profile, display_name: "DEMO — Marco Bianchi", location: "Modena, IT", day_rate: 540 },
    },
    {
      ...base,
      id: "demo-4",
      skills_score: 82,
      is_partial: true,
      overlap_days: 3,
      missing_days: 1,
      missing_dates: [d[0]],
      edge_only: true,
      profile: { ...base.profile, display_name: "DEMO — Pierre Martin", location: "Le Mans, FR", day_rate: 500 },
    },
  ];
}
