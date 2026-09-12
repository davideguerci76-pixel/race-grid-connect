import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarDays, Check, PlayCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { CandidateMatchCard } from "@/components/cards/candidate-match-card";
import { cardBtn } from "@/components/cards/primitives";
import { PitCallSummary } from "@/components/pitcall-summary";
import { supabase } from "@/integrations/supabase/client";
import { disciplineLabel, languageLabel, skillLabel } from "@/lib/paddock";
import { levelLabel, roleGroupLabel, subRoleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * TRY A DEMO PIT CALL — guided, deterministic product tour.
 * All choices, dates, previews and matches are local synthetic state. The only
 * write is the one-way account marker recorded after the complete final path.
 */
function demoDates(): Date[] {
  const now = new Date();
  const year = now > new Date(now.getFullYear(), 9, 17) ? now.getFullYear() + 1 : now.getFullYear();
  return [14, 15, 16, 17].map((day) => new Date(year, 9, day));
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const DEMO_SUB_ROLE = "race_engineer";
const DEMO_DISCIPLINE = "gt3";
const DEMO_LANGUAGE = "en";
const DEMO_MIN_YEARS = 3;
const DEMO_SKILL_1 = "data_analysis";
const DEMO_SKILL_2 = "corner_weights_setup";

type Step = "intro" | "role" | "dates" | "requirements" | "preview1" | "requirements2" | "preview2" | "results" | "end";
type CreateStep = Extract<Step, "role" | "dates" | "requirements" | "requirements2">;

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
  const queryClient = useQueryClient();
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

  const completeDemo = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mark_guided_demo_completed");
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-profile"] }),
  });

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

  const finish = () => {
    setStep("end");
    completeDemo.mutate();
  };

  const fmtDay = (date: Date) => new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "long" }).format(date);
  const rangeLabel = `${fmtDay(required[0])} – ${new Intl.DateTimeFormat(i18n.language, { day: "numeric" }).format(required[3])}`;
  const selectedKeys = dates.map(ymd);
  const datesOk = requiredKeys.every((key) => selectedKeys.includes(key)) && selectedKeys.length === 4;
  const baseReqOk = discipline === DEMO_DISCIPLINE && years === DEMO_MIN_YEARS && language === DEMO_LANGUAGE && skills.includes(DEMO_SKILL_1);
  const secondReqOk = baseReqOk && skills.includes(DEMO_SKILL_2);
  const matches = useMemo(() => demoMatches(required), [required]);

  const summaryRequest = {
    title: t("trial.create.pitcall_title"),
    role_group: "engineering",
    sub_role: role,
    sub_role_min_level: "junior",
    sub_role_hard: false,
    discipline: discipline ?? DEMO_DISCIPLINE,
    duration: "race_weekend",
    start_date: datesOk ? requiredKeys[0] : null,
    end_date: datesOk ? requiredKeys[3] : null,
    location: null,
    location_relevance: "not_relevant",
    currency: "EUR",
    skills,
    skills_hard: [],
    education: [],
    experience_requirements: years ? [{ discipline: discipline ?? DEMO_DISCIPLINE, min_years: years, hard: true }] : [],
    languages: language ? [{ code: language, level: "fluent", hard: true }] : [],
    travel_required: true,
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="container-page py-6 sm:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 border border-racing-yellow/60 bg-racing-yellow/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-racing-yellow">
            <Sparkles className="size-3" /> {t("trial.badge")}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={restart} className={cardBtn.secondary} aria-label={t("trial.restart")}>
              <RotateCcw className="size-3.5" /> <span className="hidden sm:inline">{t("trial.restart")}</span>
            </button>
            <button type="button" onClick={() => navigate({ to: "/dashboard" })} className={cardBtn.secondary} aria-label={t("trial.exit")}>
              <X className="size-3.5" /> <span className="hidden sm:inline">{t("trial.exit")}</span>
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

        {isCreateStep(step) && (
          <GuidedCreate
            step={step}
            hint={
              step === "role"
                ? t("trial.create.step_role", { role: subRoleLabel(DEMO_SUB_ROLE) })
                : step === "dates"
                  ? t("trial.create.step_dates", { range: rangeLabel })
                  : step === "requirements"
                    ? t("trial.create.step_requirements")
                    : t("trial.create.step_specific", { skill: skillLabel(DEMO_SKILL_2) })
            }
            summary={<PitCallSummary request={summaryRequest} />}
          >
            <CreateSection active={step === "role"} complete={role === DEMO_SUB_ROLE} label={t("trial.create.role_section")}>
              <div className="grid gap-3 md:grid-cols-2">
                <RealSelect label={t("sweep_engage.new_request.macro_role_label")} value="engineering" disabled options={[{ value: "engineering", label: roleGroupLabel("engineering") }]} />
                <RealSelect
                  label={t("sweep_engage.new_request.sub_role_label")}
                  value={role ?? ""}
                  onChange={setRole}
                  disabled={step !== "role"}
                  target={DEMO_SUB_ROLE}
                  options={[
                    { value: "", label: t("sweep_engage.new_request.any_sub_role") },
                    { value: DEMO_SUB_ROLE, label: subRoleLabel(DEMO_SUB_ROLE) },
                    { value: "performance_engineer", label: subRoleLabel("performance_engineer") },
                    { value: "test_engineer", label: subRoleLabel("test_engineer") },
                  ]}
                />
              </div>
              {step === "role" && <Cta onClick={() => setStep("dates")} label={t("trial.next")} disabled={role !== DEMO_SUB_ROLE} />}
            </CreateSection>

            <CreateSection active={step === "dates"} complete={datesOk} label={t("trial.create.dates_section")}>
              <AvailabilityCalendar
                selected={dates}
                onSelect={(next) => setDates(next ?? [])}
                showBulkActions={false}
                legend={t("trial.dates.legend")}
                disabled={(date) => step !== "dates" || !requiredKeys.includes(ymd(date))}
              />
              {datesOk && <p className="mt-3 text-sm text-muted-foreground">{t("trial.dates.note")}</p>}
              {step === "dates" && <Cta onClick={() => setStep("requirements")} label={t("trial.next")} disabled={!datesOk} />}
            </CreateSection>

            <CreateSection active={step === "requirements" || step === "requirements2"} complete={step === "requirements2" ? secondReqOk : baseReqOk} label={t("trial.create.requirements_section")}>
              <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                <RealSelect
                  label={t("jobs.filters.discipline")}
                  value={discipline ?? ""}
                  onChange={setDiscipline}
                  disabled={step !== "requirements"}
                  target={DEMO_DISCIPLINE}
                  options={[{ value: "", label: "—" }, ...["gt3", "gt4", "tcr"].map((value) => ({ value, label: disciplineLabel(value) }))]}
                />
                <RealSelect
                  label={t("trial.req.field_experience")}
                  value={years ? String(years) : ""}
                  onChange={(value) => setYears(value ? Number(value) : null)}
                  disabled={step !== "requirements"}
                  target={String(DEMO_MIN_YEARS)}
                  options={[{ value: "", label: "—" }, ...[1, 3, 5].map((value) => ({ value: String(value), label: t("trial.req.years_min", { count: value }) }))]}
                />
                <RealSelect
                  label={t("trial.req.field_language")}
                  value={language ?? ""}
                  onChange={setLanguage}
                  disabled={step !== "requirements"}
                  target={DEMO_LANGUAGE}
                  options={[{ value: "", label: "—" }, ...["en", "it", "de"].map((value) => ({ value, label: languageLabel(value) }))]}
                />
                <div className="md:col-span-2">
                  <label className="label-mono">{t("sweep_engage.new_request.required_skills")} <span className="text-racing-red">({skills.length})</span></label>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[DEMO_SKILL_1, DEMO_SKILL_2, "strategy_engineer"].map((value) => {
                      const selected = skills.includes(value);
                      const enabled = (step === "requirements" && value === DEMO_SKILL_1) || (step === "requirements2" && value === DEMO_SKILL_2);
                      const target = enabled && !selected;
                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={!enabled}
                          onClick={() => setSkills((current) => current.includes(value) ? current.filter((skill) => skill !== value) : [...current, value])}
                          className={cn(
                            "border px-2 py-1 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                            selected ? "border-racing-yellow bg-racing-yellow/15 text-racing-yellow" : "border-border",
                            target && "border-racing-yellow ring-2 ring-racing-yellow/30",
                          )}
                        >
                          {skillLabel(value)}{selected ? " ○" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {step === "requirements" ? (
                <Cta onClick={() => setStep("preview1")} label={t("trial.req.cta")} disabled={!baseReqOk} />
              ) : (
                <Cta onClick={() => setStep("preview2")} label={t("trial.req2.cta")} disabled={!secondReqOk} />
              )}
            </CreateSection>
          </GuidedCreate>
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
          <section className="mt-8">
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">{t("trial.results.title")}</h1>
            <div className="sticky top-16 z-10 mt-4 border border-racing-red bg-card p-4 shadow-lg">
              <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-racing-red">{t("trial.results.callout_step", { current: callout + 1, total: 3 })}</div>
              <div className="mt-1 text-lg font-bold">{t(`trial.results.callout${callout + 1}.title`)}</div>
              <p className="mt-1 text-sm text-muted-foreground">{t(`trial.results.callout${callout + 1}.body`, { day: fmtDay(required[3]) })}</p>
              <div className="mt-3">
                <button type="button" onClick={() => callout < 2 ? setCallout((current) => current + 1) : finish()} className={cardBtn.primary}>
                  {callout < 2 ? t("trial.next") : t("trial.results.cta_end")}
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-4">
              {matches.map((match, index) => (
                <div key={match.id} className={cn("transition-shadow", (callout === 0 && index === 0) || (callout === 1 && index === 1) || (callout === 2 && (index === 1 || index === 2)) ? "ring-2 ring-racing-yellow ring-offset-2 ring-offset-background" : "opacity-90")}>
                  <CandidateMatchCard match={match} mode="request" hideActions />
                </div>
              ))}
            </div>
          </section>
        )}

        {step === "end" && (
          <Panel title={t("trial.end.title")}>
            <ul className="grid gap-2 text-muted-foreground">
              <li>• {t("trial.end.point_dates")}</li>
              <li>• {t("trial.end.point_preview")}</li>
              <li>• {t("trial.end.point_requirements")}</li>
              <li>• {t("trial.end.point_matches")}</li>
            </ul>
            <div className="mt-5 border border-racing-yellow/50 bg-racing-yellow/5 p-4">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-widest text-racing-yellow">{t("trial.results.next.title")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t("trial.results.next.body")}</p>
              <ol className="mt-3 grid gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground sm:grid-cols-4">
                <li className="flex items-center gap-2"><span className="text-racing-yellow">1.</span>{t("trial.results.next.step_choose")}</li>
                <li className="flex items-center gap-2"><span className="text-racing-yellow">2.</span>{t("trial.results.next.step_request")}</li>
                <li className="flex items-center gap-2"><span className="text-racing-yellow">3.</span>{t("trial.results.next.step_confirm")}</li>
                <li className="flex items-center gap-2"><span className="text-racing-yellow">4.</span>{t("trial.results.next.step_contact")}</li>
              </ol>
            </div>
            <p className="mt-4 font-bold">{t("trial.end.preopen")}</p>
            {completeDemo.isError && <p className="mt-3 text-sm text-racing-red">{t("trial.end.completion_error")}</p>}
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/dashboard" className={cardBtn.primary}>{t("trial.end.cta")}</Link>
              <button type="button" onClick={restart} className={cardBtn.secondary}><RotateCcw className="size-3.5" /> {t("trial.restart")}</button>
            </div>
          </Panel>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function isCreateStep(step: Step): step is CreateStep {
  return step === "role" || step === "dates" || step === "requirements" || step === "requirements2";
}

function GuidedCreate({ step, hint, summary, children }: { step: CreateStep; hint: string; summary: React.ReactNode; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="mt-6">
      <div className="grid min-w-0 grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <div className="label-mono">[{t("requests.new").toUpperCase()}]</div>
          <h1 className="max-w-full text-3xl font-black uppercase italic leading-tight sm:text-4xl">{t("requests.new")}</h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-racing-red">{t("trial.create.helper")}</p>
        </div>
      </div>
      <div className="sticky top-16 z-20 mt-5 border border-racing-yellow bg-card p-3 shadow-lg sm:p-4">
        <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-racing-yellow">{t("trial.create.guided_label")}</div>
        <p className="mt-1 text-sm font-bold sm:text-base">{hint}</p>
      </div>
      <div className="mt-6">
        <div className="mb-2 label-mono text-racing-red">[{t("sweep_engage.new_request.preview_title")}]</div>
        {summary}
      </div>
      <form onSubmit={(event) => event.preventDefault()} className="mt-6 grid min-w-0 grid-cols-1 gap-4 border border-border bg-card p-4 sm:p-6">
        {children}
      </form>
      <span className="sr-only">{step}</span>
    </div>
  );
}

function CreateSection({ active, complete, label, children }: { active: boolean; complete: boolean; label: string; children: React.ReactNode }) {
  return (
    <fieldset disabled={!active} className={cn("min-w-0 border p-3 transition-all sm:p-4", active ? "border-racing-yellow bg-racing-yellow/5 ring-2 ring-racing-yellow/20" : complete ? "border-success/50 bg-success/5" : "border-border opacity-45")}>
      <legend className="px-2 font-mono text-[11px] font-bold uppercase tracking-widest">
        <span className="inline-flex items-center gap-2">{complete && <Check className="size-3.5 text-success" />}{label}</span>
      </legend>
      {children}
    </fieldset>
  );
}

function RealSelect({ label, value, onChange, options, disabled = false, target }: { label: string; value: string; onChange?: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean; target?: string }) {
  return (
    <div className="min-w-0">
      <label className="label-mono">{label}</label>
      <select value={value} onChange={(event) => onChange?.(event.target.value)} disabled={disabled} className={cn("mt-1 w-full min-w-0 border bg-background px-3 py-2 disabled:opacity-65", target && value !== target ? "border-racing-yellow ring-2 ring-racing-yellow/20" : "border-border")}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {target && value !== target && <p className="mt-1 font-mono text-[10px] uppercase text-racing-yellow">→ {options.find((option) => option.value === target)?.label}</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-6 border border-border bg-card p-5 sm:p-7"><h1 className="text-2xl font-black uppercase italic tracking-tighter sm:text-3xl">{title}</h1><div className="mt-4">{children}</div></section>;
}

function Cta({ onClick, label, disabled = false, icon }: { onClick: () => void; label: string; disabled?: boolean; icon?: React.ReactNode }) {
  return <div className="mt-6"><button type="button" onClick={onClick} disabled={disabled} className={cardBtn.primary}>{icon} {label}</button></div>;
}

function PreviewBox({ count, coverage, tone }: { count: number; coverage: string; tone: "success" | "warn" }) {
  const { t } = useTranslation();
  return (
    <div className={cn("border p-5", tone === "success" ? "border-success/60 bg-success/5" : "border-racing-yellow/60 bg-racing-yellow/5")}>
      <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><CalendarDays className="size-3.5" /> {t("trial.preview.label")}</div>
      <div className="mt-2 text-4xl font-black italic tracking-tighter">{count}</div>
      <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("trial.preview.matchable")}</div>
      <div className={cn("mt-3 inline-block border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest", tone === "success" ? "border-success/60 text-success" : "border-racing-yellow/60 text-racing-yellow")}>{coverage}</div>
    </div>
  );
}

function demoMatches(required: Date[]) {
  const dates = required.map(ymd);
  const base = { unlocked: true, blurred: false, missing_criteria: [], profile: { role_group: "engineering", sub_roles: [{ sub_role: DEMO_SUB_ROLE, level: "senior" }], disciplines: [DEMO_DISCIPLINE], skills: [DEMO_SKILL_1, DEMO_SKILL_2], languages: [{ code: DEMO_LANGUAGE, level: "fluent" }], experiences: [{ discipline: DEMO_DISCIPLINE, years: 8 }], travels: true } };
  return [
    { ...base, id: "demo-1", skills_score: 100, is_partial: false, overlap_days: 4, missing_days: 0, missing_dates: [], profile: { ...base.profile, display_name: "DEMO — Alex Morgan", location: "Silverstone, UK", day_rate: 620 } },
    { ...base, id: "demo-2", skills_score: 94, is_partial: true, overlap_days: 3, missing_days: 1, missing_dates: [dates[3]], edge_only: true, profile: { ...base.profile, display_name: "DEMO — James Wilson", location: "Oxford, UK", day_rate: 580 } },
    { ...base, id: "demo-3", skills_score: 88, is_partial: false, overlap_days: 4, missing_days: 0, missing_dates: [], profile: { ...base.profile, display_name: "DEMO — Marco Bianchi", location: "Modena, IT", day_rate: 540 } },
    { ...base, id: "demo-4", skills_score: 82, is_partial: true, overlap_days: 3, missing_days: 1, missing_dates: [dates[0]], edge_only: true, profile: { ...base.profile, display_name: "DEMO — Pierre Martin", location: "Le Mans, FR", day_rate: 500 } },
  ];
}
