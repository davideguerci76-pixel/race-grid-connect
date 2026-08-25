import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { createRequest, getMyRequests } from "@/lib/paddock.functions";
import { getPlatformSettings } from "@/lib/admin.functions";
import { getMyPool } from "@/lib/pool.functions";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import { ROLE_GROUPS, SUB_ROLE_LEVELS, levelLabel, roleGroupLabel, skillsForGroup, subRolesForGroup } from "@/lib/roles";
import { DISCIPLINE_OPTIONS, DURATIONS, EDUCATION_OPTIONS, EXPERIENCE_YEARS_OPTIONS, LANGUAGE_LEVELS, LANGUAGE_OPTIONS, MAX_REQUEST_EXPERIENCE_REQS, MAX_REQUEST_LANGUAGES, SKILL_OPTIONS, educationLabel, languageLabel, languageLevelLabel, skillLabel, type DurationType, type LanguageLevel, type RequestExperienceRequirement, type RequestLanguageRequirement } from "@/lib/paddock";
import { BackButton } from "@/components/back-button";
import { CalendarSourcePicker } from "@/components/calendar-source-picker";
import { dateOf } from "@/lib/ics";

type LocRelevance = "not_relevant" | "relevant" | "mandatory";
type LocAnchor = "this" | "team";
const RADIUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "25", label: "25 km" },
  { value: "50", label: "50 km" },
  { value: "100", label: "100 km" },
  { value: "200", label: "200 km" },
  { value: "500", label: "500 km" },
  { value: "1000", label: "1000 km" },
  { value: "any", label: "ANY" },
];

const search = z.object({
  from: fallback(z.string().optional(), undefined),
  mode: fallback(z.enum(["similar", "identical"]).optional(), undefined),
});


export const Route = createFileRoute("/_authenticated/dashboard/requests/new")({
  validateSearch: zodValidator(search),
  component: NewRequestPage,
});

type SearchMode = "standard" | "pool";



function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function NewRequestPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { from, mode } = Route.useSearch();
  const identical = mode === "identical" && !!from;


  const { data: profile } = useQuery({
    queryKey: ["request-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: p }, { data: balance }] = await Promise.all([
        supabase.from("profiles").select("user_type").eq("id", user!.id).maybeSingle(),
        supabase.rpc("my_token_balance"),
      ]);
      return { user_type: p?.user_type, token_balance: (balance as number | null) ?? 0 };
    },
  });

  useEffect(() => {
    if (profile && profile.user_type !== "team") navigate({ to: "/dashboard/calendar" });
  }, [profile, navigate]);

  const list = useServerFn(getMyRequests);
  const create = useServerFn(createRequest);
  const fetchSettings = useServerFn(getPlatformSettings);
  const fetchPool = useServerFn(getMyPool);

  const { data: settings = [] } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => fetchSettings(),
    staleTime: 0,
  });
  const setting = (key: string, fallbackValue: number) =>
    Number((settings as Array<{ key: string; value_num: number }>).find((s) => s.key === key)?.value_num ?? fallbackValue);

  const { data: pool = [] } = useQuery({ queryKey: ["my-pool"], queryFn: () => fetchPool(), enabled: !!user });
  const [searchMode, setSearchMode] = useState<SearchMode>("standard");


  const { data: existing } = useQuery({
    queryKey: ["my-requests", user?.id],
    enabled: !!user && !!from,
    queryFn: () => list(),
  });
  const source = from ? existing?.find((r) => r.id === from) : null;

  const [form, setForm] = useState({
    title: "",
    role_group: "engineering" as string,
    sub_role: "" as string,
    sub_role_min_level: "junior" as "junior" | "intermediate" | "senior",
    discipline: "formula_1" as string,
    duration: "race_weekend" as DurationType,
    circuit: "",
    location: "",
    start_date: "",
    end_date: "",
    budget_min: "",
    budget_max: "",
    budget_unit: "day" as "day" | "event" | "season",
    notes: "",
  });
  const [subRoleHard, setSubRoleHard] = useState(false);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [travelRequired, setTravelRequired] = useState(true);
  const [seasonDates, setSeasonDates] = useState<Date[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillsHard, setSkillsHard] = useState<string[]>([]);
  const [education, setEducation] = useState<string[]>([]);
  const [experienceReqs, setExperienceReqs] = useState<RequestExperienceRequirement[]>([]);
  const [languageReqs, setLanguageReqs] = useState<RequestLanguageRequirement[]>([]);
  const [locationCoords, setLocationCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [locationDetails, setLocationDetails] = useState<{ city: string | null; region: string | null; country: string | null; placeId: string | null }>({ city: null, region: null, country: null, placeId: null });
  const [locRelevance, setLocRelevance] = useState<LocRelevance>("not_relevant");
  const [locAnchor, setLocAnchor] = useState<LocAnchor>("this");
  const [locRadius, setLocRadius] = useState<string>("100");

  useEffect(() => {
    if (!source) return;
    const s: any = source;
    setForm({
      title: s.title,
      role_group: (s.role_group as string) ?? "engineering",
      sub_role: (s.sub_role as string) ?? "",
      sub_role_min_level: (s.sub_role_min_level as "junior" | "intermediate" | "senior") ?? "junior",
      discipline: s.discipline as string,
      duration: s.duration as DurationType,
      circuit: s.circuit ?? "",
      location: s.location ?? "",
      start_date: identical ? (s.start_date ?? "") : "",
      end_date: identical ? (s.end_date ?? "") : "",
      budget_min: s.budget_min ? String(s.budget_min) : "",
      budget_max: s.budget_max ? String(s.budget_max) : "",
      budget_unit: (s.budget_unit as "day" | "event" | "season") ?? "day",
      notes: s.notes ?? "",
    });
    setSubRoleHard(s.sub_role_hard ?? false);
    setTravelRequired(s.travel_required ?? true);
    setSkills(Array.isArray(s.skills) ? s.skills : []);
    setSkillsHard(Array.isArray(s.skills_hard) ? s.skills_hard : []);
    setEducation(Array.isArray(s.education) ? s.education : []);
    setExperienceReqs(Array.isArray(s.experience_requirements) ? s.experience_requirements : []);
    setLanguageReqs(Array.isArray(s.languages) ? s.languages : []);
    setLocationCoords({ lat: s.location_lat ?? null, lng: s.location_lng ?? null });
    setLocationDetails({ city: s.location_city ?? null, region: s.location_region ?? null, country: s.location_country ?? null, placeId: s.location_place_id ?? null });
    setLocRelevance((s.location_relevance as LocRelevance) ?? "not_relevant");
    setLocAnchor((s.location_anchor as LocAnchor) ?? "this");
    setLocRadius(s.location_radius_km == null ? "any" : String(s.location_radius_km));
    if (Array.isArray(s.season_dates)) {
      setSeasonDates(s.season_dates.map((d: string) => {
        const [y, m, day] = d.split("-").map(Number);
        return new Date(y, m - 1, day);
      }));
    } else {
      setSeasonDates([]);
    }
  }, [source, identical]);

  const isSeason = form.duration === "full_season";
  const baseCost = isSeason
    ? setting("cost_request_full_season", 15)
    : setting("cost_request_race_weekend", 5);
  const repostCost = isSeason
    ? setting("cost_repost_identical_full_season", 10)
    : setting("cost_repost_identical_race_weekend", 3);
  const standardCost = identical ? repostCost : baseCost;
  const poolSearchCost = setting("cost_pool_search", 5);
  const displayCost = searchMode === "pool" ? poolSearchCost : standardCost;

  const balance = profile?.token_balance ?? 0;
  const canAfford = balance >= displayCost;

  const seasonDatesIso = useMemo(() => seasonDates.map(fmt).sort(), [seasonDates]);

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          title: form.title,
          role_group: form.role_group,
          sub_role: form.sub_role || null,
          sub_role_min_level: form.sub_role_min_level,
          sub_role_hard: subRoleHard,
          discipline: form.discipline,
          duration: form.duration,
          circuit: form.circuit || null,
          location: form.location || null,
          start_date: isSeason ? seasonDatesIso[0] : form.start_date,
          end_date: isSeason ? seasonDatesIso[seasonDatesIso.length - 1] : form.end_date,
          budget_min: form.budget_min ? parseInt(form.budget_min) : null,
          budget_max: form.budget_max ? parseInt(form.budget_max) : null,
          budget_unit: isSeason ? "season" : form.budget_unit,
          notes: form.notes || null,
          ...(isSeason ? { season_dates: seasonDatesIso } : {}),
          travel_required: travelRequired,
          skills,
          skills_hard: skillsHard,
          education,
          experience_requirements: experienceReqs,
          languages: languageReqs.map((l) => ({
            code: l.code,
            level: l.level,
            hard: l.hard,
            custom: l.code === "other" ? (l.custom ?? null) : null,
          })),
          ...(identical && from ? { repost_of: from } : {}),
          location_lat: locationCoords.lat,
          location_lng: locationCoords.lng,
          location_city: locationDetails.city,
          location_region: locationDetails.region,
          location_country: locationDetails.country,
          location_place_id: locationDetails.placeId,
          location_relevance: locRelevance,
          location_anchor: locAnchor,
          location_radius_km: locRelevance === "not_relevant" || locRadius === "any" ? null : parseInt(locRadius),
          search_mode: searchMode,
        } as never,
      }),
    onSuccess: () => {
      toast.success(t("requests.posted", { cost: displayCost }));
      qc.invalidateQueries();
      navigate({ to: searchMode === "pool" ? "/dashboard/pool" : "/dashboard/requests" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page py-12">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="label-mono">[NEW PIT CALL]</div>
            <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("requests.new")}</h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-racing-red">{t("requests.helper")}</p>

          </div>
          <Link to="/dashboard/requests" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-racing-red">
            ← {t("requests.back")}
          </Link>
        </div>

        {/* Standard vs My Pool search mode */}
        <div className="mt-6 border border-border bg-card p-4">
          <div className="label-mono">[{t("pool.mode_title")}]</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {(["standard", "pool"] as SearchMode[]).map((m) => {
              const active = searchMode === m;
              const isPool = m === "pool";
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSearchMode(m)}
                  className={`border p-4 text-left transition-colors ${
                    active
                      ? isPool
                        ? "border-sky-400 bg-sky-400/10"
                        : "border-racing-red bg-racing-red/10"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block size-3 rounded-full border ${
                        active ? (isPool ? "border-sky-400 bg-sky-400" : "border-racing-red bg-racing-red") : "border-muted-foreground"
                      }`}
                    />
                    <span className="text-sm font-bold uppercase tracking-widest">
                      {isPool ? t("pool.mode_pool") : t("pool.mode_standard")}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {isPool ? t("pool.mode_pool_desc") : t("pool.mode_standard_desc")}
                  </p>
                </button>
              );
            })}
          </div>
          {searchMode === "pool" && (
            <div className="mt-3 border border-sky-400/50 bg-sky-400/5 p-3 text-xs text-sky-200">
              {t("pool.mode_pool_note", { count: (pool as any[]).length, cost: poolSearchCost })}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border border-border bg-card p-4 text-sm">
          <span className="font-mono text-xs uppercase text-muted-foreground">{t("requests.cost")}:</span>
          <span className="font-bold text-racing-red">{displayCost} tokens</span>
          <span className="ml-auto font-mono text-xs uppercase text-muted-foreground">{t("requests.balance")}:</span>
          <span className={`font-bold ${canAfford ? "text-foreground" : "text-racing-red"}`}>{balance}</span>
          {!canAfford && (
            <Link to="/dashboard/tokens" className="ml-3 border border-racing-red px-3 py-1 text-[11px] font-bold uppercase text-racing-red hover:bg-racing-red/10">
              {t("requests.top_up")}
            </Link>
          )}
        </div>

        {identical && (
          <div className="mt-4 border-2 border-racing-yellow bg-racing-yellow/5 p-4">
            <div className="label-mono text-racing-yellow">[IDENTICAL REPOST]</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("sweep_engage.new_request.identical_locked_note", { repostCost, baseCost })} <span className="font-bold">{t("sweep_engage.requests.repost_similar")}</span> {t("sweep_engage.new_request.instead")}.
            </p>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canAfford) {
              toast.error(t("requests.insufficient"));
              return;
            }
            if (isSeason && seasonDatesIso.length === 0) {
              toast.error(t("sweep_engage.new_request.select_working_day"));
              return;
            }
            mut.mutate();
          }}
          className="mt-6 grid gap-4 border border-border bg-card p-6 md:grid-cols-2"
        >
          <fieldset disabled={identical} className="contents">

          <div className="md:col-span-2">
            <label className="label-mono">{t("sweep_engage.new_request.title_label")}</label>
            <input
              required
              minLength={3}
              maxLength={120}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t("sweep_engage.new_request.title_placeholder")}
              className="mt-1 w-full border border-border bg-background px-3 py-2"
            />
          </div>

          <div>
            <label className="label-mono">{t("sweep_engage.new_request.macro_role_label")}</label>
            <select
              value={form.role_group}
              onChange={(e) => setForm({ ...form, role_group: e.target.value, sub_role: "" })}
              className="mt-1 w-full border border-border bg-background px-3 py-2"
            >
              {ROLE_GROUPS.map((g) => (<option key={g.value} value={g.value}>{g.label}</option>))}
            </select>
            <p className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">
              {t("sweep_engage.new_request.macro_role_hard_filter", { role: roleGroupLabel(form.role_group) })}
            </p>
          </div>

          <div>
            <label className="label-mono">{t("sweep_engage.new_request.sub_role_label")}</label>
            <div className="mt-1 flex gap-2">
              <select
                value={form.sub_role}
                onChange={(e) => setForm({ ...form, sub_role: e.target.value })}
                className="flex-1 border border-border bg-background px-3 py-2"
              >
                <option value="">{t("sweep_engage.new_request.any_sub_role")}</option>
                {subRolesForGroup(form.role_group).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                value={form.sub_role_min_level}
                onChange={(e) => setForm({ ...form, sub_role_min_level: e.target.value as "junior" | "intermediate" | "senior" })}
                disabled={!form.sub_role}
                className="border border-border bg-background px-3 py-2 disabled:opacity-40"
              >
                {SUB_ROLE_LEVELS.map((l) => (<option key={l} value={l}>{levelLabel(l)}</option>))}
              </select>
              <button
                type="button"
                disabled={!form.sub_role}
                onClick={() => setSubRoleHard(!subRoleHard)}
                title={subRoleHard ? t("sweep_engage.new_request.hard_only_tooltip") : t("sweep_engage.new_request.soft_weighted_tooltip")}
                className={`border px-3 py-2 text-[11px] font-bold uppercase disabled:opacity-40 ${subRoleHard ? "border-racing-red bg-racing-red/10 text-racing-red" : "border-border text-muted-foreground"}`}
              >
                {subRoleHard ? t("sweep_engage.new_request.hard") : t("sweep_engage.new_request.soft")}
              </button>
            </div>
          </div>
          <SelectField
            label={t("jobs.filters.discipline")}
            value={form.discipline}
            onChange={(v) => setForm({ ...form, discipline: v })}
            options={DISCIPLINE_OPTIONS}
          />

          <SelectField
            label={t("jobs.filters.duration")}
            value={form.duration}
            onChange={(v) => setForm({ ...form, duration: v as DurationType })}
            options={DURATIONS.map((r) => ({ value: r, label: t(`duration.${r}`) }))}
          />
          <div className="md:col-span-2 border border-border bg-background/40 p-3">
            <label className="label-mono">{t("sweep_engage.new_request.location_circuit_label")}</label>
            <LocationAutocomplete
              value={form.location}
              onChange={(v) => {
                setForm({ ...form, location: v, circuit: v });
                setLocationCoords({ lat: null, lng: null });
                setLocationDetails({ city: null, region: null, country: null, placeId: null });
              }}
              onPick={(p) => {
                setForm({ ...form, location: p.text, circuit: p.text });
                setLocationCoords({ lat: p.lat, lng: p.lng });
                setLocationDetails({ city: p.city, region: p.region, country: p.country, placeId: p.placeId });
              }}
              placeholder={t("sweep_engage.new_request.location_placeholder")}
              includeAllPlaces
              className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setLocRelevance(locRelevance === "not_relevant" ? "relevant" : locRelevance === "relevant" ? "mandatory" : "not_relevant");
                }}
                title={t("sweep_engage.new_request.location_cycle_tooltip")}
                className={`border px-3 py-2 text-[11px] font-bold uppercase tracking-widest ${
                  locRelevance === "mandatory"
                    ? "border-racing-red bg-racing-red text-white"
                    : locRelevance === "relevant"
                    ? "border-racing-yellow bg-racing-yellow text-black"
                    : "border-border bg-black text-white"
                }`}
              >
                {locRelevance === "mandatory" ? t("sweep_engage.new_request.mandatory") : locRelevance === "relevant" ? t("sweep_engage.new_request.relevant") : t("sweep_engage.new_request.not_relevant")}
              </button>

              {locRelevance !== "not_relevant" && (
                <>
                  <div className="inline-flex border border-border">
                    <button
                      type="button"
                      onClick={() => setLocAnchor("this")}
                      className={`px-3 py-2 text-[11px] font-bold uppercase ${locAnchor === "this" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary"}`}
                    >
                      {t("sweep_engage.new_request.this_location")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocAnchor("team")}
                      className={`border-l border-border px-3 py-2 text-[11px] font-bold uppercase ${locAnchor === "team" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary"}`}
                    >
                      {t("sweep_engage.new_request.team_location")}
                    </button>
                  </div>

                  <label className="flex items-center gap-2 text-[11px] font-mono uppercase text-muted-foreground">
                    {t("sweep_engage.new_request.max_distance")}
                    <select
                      value={locRadius}
                      onChange={(e) => setLocRadius(e.target.value)}
                      className="border border-border bg-background px-2 py-1 text-sm"
                    >
                      {RADIUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {locRelevance === "not_relevant" && t("sweep_engage.new_request.distance_ignored")}
              {locRelevance === "relevant" && t("sweep_engage.new_request.distance_relevant_note")}
              {locRelevance === "mandatory" && <span className="text-racing-red font-bold">{t("sweep_engage.new_request.distance_mandatory_note")}</span>}
              {" "}{t("sweep_engage.new_request.distance_haversine")}
              {locRelevance !== "not_relevant" && locAnchor === "team" && ` ${t("sweep_engage.new_request.anchor_team")}`}
              {locRelevance !== "not_relevant" && locAnchor === "this" && ` ${t("sweep_engage.new_request.anchor_this")}`}
            </p>
            {locRelevance !== "not_relevant" && locAnchor === "this" && !locationCoords.lat && (
              <p className="mt-1 text-[11px] text-racing-yellow">{t("sweep_engage.new_request.pick_location_hint")}</p>
            )}
          </div>


          {!isSeason && (
            <>
              <div>
                <label className="label-mono">{t("sweep_engage.new_request.start_date")}</label>
                <input type="date" required={!isSeason} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2" />
              </div>
              <div>
                <label className="label-mono">{t("sweep_engage.new_request.end_date")}</label>
                <input type="date" required={!isSeason} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2" />
              </div>
            </>
          )}

          <div>
            <label className="label-mono">{t("sweep_engage.new_request.budget_min")}</label>
            <input type="number" min="0" value={form.budget_min} onChange={(e) => setForm({ ...form, budget_min: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2" />
          </div>
          <div>
            <label className="label-mono">{t("sweep_engage.new_request.budget_max")}</label>
            <input type="number" min="0" value={form.budget_max} onChange={(e) => setForm({ ...form, budget_max: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2" />
          </div>

          {isSeason && (
            <div className="md:col-span-2">
              <label className="label-mono">{t("sweep_engage.new_request.season_working_days")}</label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("sweep_engage.new_request.season_working_days_help")}
              </p>
              <p className="mt-1 font-mono text-xs text-racing-red">{t("sweep_engage.new_request.days_selected", { count: seasonDatesIso.length })}</p>
              <div className={`mt-3 ${identical ? "pointer-events-none opacity-70" : ""}`}>
                <CalendarSourcePicker
                  className="mb-3"
                  value={seasonDatesIso}
                  onChange={(dates) => setSeasonDates(dates.map(dateOf))}
                />
                <AvailabilityCalendar
                  selected={seasonDates}
                  onSelect={(d) => setSeasonDates(d ?? [])}
                  min={new Date()}
                  legend={t("sweep_engage.new_request.calendar_legend")}
                />

              </div>

            </div>
          )}

          <div className="md:col-span-2 border border-border bg-background/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="label-mono">{t("sweep_engage.new_request.available_to_travel")}</div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("sweep_engage.new_request.travel_hard_prefix")} <span className="font-bold text-racing-red">{t("sweep_engage.new_request.hard")}</span> {t("sweep_engage.new_request.travel_hard_suffix")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTravelRequired(!travelRequired)}
                className={`border px-3 py-2 text-[11px] font-bold uppercase ${travelRequired ? "border-racing-red bg-racing-red/10 text-racing-red" : "border-border text-muted-foreground"}`}
              >
                {travelRequired ? t("sweep_engage.new_request.required_hard") : t("sweep_engage.new_request.not_required")}
              </button>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="label-mono">
              {t("sweep_engage.new_request.required_skills")} <span className="text-racing-red">({skills.length + skillsHard.length})</span>
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              <button
                type="button"
                onClick={() => setShowAllSkills((v) => !v)}
                className="float-right font-mono text-[10px] uppercase tracking-widest text-racing-red hover:underline"
              >
                {showAllSkills ? t("sweep_engage.new_request.show_macro_skills") : t("sweep_engage.new_request.show_all_skills")}
              </button>
              {t("sweep_engage.new_request.skill_cycle_help_prefix")} <span className="font-bold text-yellow-500">{t("sweep_engage.new_request.soft_upper")}</span> {t("sweep_engage.new_request.skill_cycle_help_mid")} <span className="font-bold text-racing-red">{t("sweep_engage.new_request.hard_upper")}</span> {t("sweep_engage.new_request.skill_cycle_help_suffix")}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(showAllSkills ? SKILL_OPTIONS.map((o) => o.value) : skillsForGroup(form.role_group)).map((sv) => {
                const o = { value: sv };
                const isSoft = skills.includes(o.value);
                const isHard = skillsHard.includes(o.value);
                const cycle = () => {
                  if (!isSoft && !isHard) {
                    setSkills([...skills, o.value]);
                  } else if (isSoft) {
                    setSkills(skills.filter((s) => s !== o.value));
                    setSkillsHard([...skillsHard, o.value]);
                  } else {
                    setSkillsHard(skillsHard.filter((s) => s !== o.value));
                  }
                };
                const cls = isHard
                  ? "border-racing-red bg-racing-red/15 text-racing-red"
                  : isSoft
                  ? "border-yellow-500 bg-yellow-500/15 text-yellow-500"
                  : "border-border hover:bg-secondary";
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={cycle}
                    title={isHard ? t("sweep_engage.new_request.hard_required_tooltip") : isSoft ? t("sweep_engage.new_request.soft_preferred_tooltip") : t("sweep_engage.new_request.not_selected_tooltip")}
                    className={`border px-2 py-1 text-[11px] font-bold transition-colors ${cls}`}
                  >
                    {skillLabel(o.value)}{isHard ? " ●" : isSoft ? " ○" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="label-mono">
              {t("sweep_engage.new_request.preferred_education")} <span className="text-racing-red">({education.length})</span>
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("sweep_engage.new_request.education_soft_note")}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EDUCATION_OPTIONS.map((o) => {
                const checked = education.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setEducation(checked ? education.filter((s) => s !== o.value) : [...education, o.value])}
                    className={`border px-2 py-1 text-[11px] transition-colors ${checked ? "border-yellow-500 bg-yellow-500/15 text-yellow-500" : "border-border hover:bg-secondary"}`}
                  >
                    {educationLabel(o.value)}
                  </button>
                );
              })}
            </div>
          </div>


          <div className="md:col-span-2">
            <label className="label-mono">
              {t("sweep_engage.new_request.experience_requirements")} <span className="text-racing-red">({experienceReqs.length}/{MAX_REQUEST_EXPERIENCE_REQS})</span>
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("sweep_engage.new_request.experience_add_up_to", { max: MAX_REQUEST_EXPERIENCE_REQS })} <span className="text-racing-red font-bold">{t("sweep_engage.new_request.hard_upper")}</span> {t("sweep_engage.new_request.experience_hard_note")} <span className="font-bold">{t("sweep_engage.new_request.soft_upper")}</span> {t("sweep_engage.new_request.experience_soft_note")}
            </p>
            <div className="mt-2 space-y-2">
              {experienceReqs.map((req, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 border border-border bg-background/40 p-2 md:grid-cols-[1fr_140px_120px_auto]">
                  <select
                    value={req.discipline}
                    onChange={(ev) => setExperienceReqs(experienceReqs.map((r, idx) => idx === i ? { ...r, discipline: ev.target.value } : r))}
                    className="border border-border bg-background px-2 py-1 text-sm"
                  >
                    {DISCIPLINE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <select
                    value={String(req.min_years)}
                    onChange={(ev) => setExperienceReqs(experienceReqs.map((r, idx) => idx === i ? { ...r, min_years: parseInt(ev.target.value) } : r))}
                    className="border border-border bg-background px-2 py-1 text-sm"
                  >
                    {EXPERIENCE_YEARS_OPTIONS.filter((o) => o.value !== "0").map((o) => (
                      <option key={o.value} value={o.value}>{t("sweep_engage.new_request.min_prefix")} {o.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setExperienceReqs(experienceReqs.map((r, idx) => idx === i ? { ...r, hard: !r.hard } : r))}
                    className={`border px-2 py-1 text-[11px] font-bold uppercase ${req.hard ? "border-racing-red bg-racing-red/10 text-racing-red" : "border-border text-muted-foreground"}`}
                  >
                    {req.hard ? t("sweep_engage.new_request.hard") : t("sweep_engage.new_request.soft")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExperienceReqs(experienceReqs.filter((_, idx) => idx !== i))}
                    className="border border-border px-3 py-1 text-[11px] font-bold uppercase text-muted-foreground hover:border-racing-red hover:text-racing-red"
                  >
                    {t("sweep_engage.new_request.remove")}
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                if (experienceReqs.length >= MAX_REQUEST_EXPERIENCE_REQS) return;
                setExperienceReqs([...experienceReqs, { discipline: DISCIPLINE_OPTIONS[0].value, min_years: 1, hard: true }]);
              }}
              disabled={experienceReqs.length >= MAX_REQUEST_EXPERIENCE_REQS}
              className="mt-2 border border-racing-red px-3 py-1 text-[11px] font-bold uppercase text-racing-red hover:bg-racing-red/10 disabled:opacity-40"
            >
              {experienceReqs.length === 0 ? t("sweep_engage.new_request.add_experience_req") : t("sweep_engage.new_request.add_another_experience_req")}
            </button>
          </div>

          <div className="md:col-span-2">
            <label className="label-mono">
              {t("sweep_engage.new_request.required_languages")} <span className="text-racing-red">({languageReqs.length}/{MAX_REQUEST_LANGUAGES})</span>
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("sweep_engage.new_request.languages_add_up_to", { max: MAX_REQUEST_LANGUAGES })} <span className="text-racing-red font-bold">{t("sweep_engage.new_request.hard_upper")}</span> {t("sweep_engage.new_request.languages_hard_note")} <span className="font-bold">{t("sweep_engage.new_request.soft_upper")}</span> {t("sweep_engage.new_request.languages_soft_note")}
            </p>
            <div className="mt-2 space-y-2">
              {languageReqs.map((req, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 border border-border bg-background/40 p-2 md:grid-cols-[1fr_1fr_120px_auto]">
                  <select
                    value={req.code}
                    onChange={(ev) => setLanguageReqs(languageReqs.map((r, idx) => idx === i ? { ...r, code: ev.target.value } : r))}
                    className="border border-border bg-background px-2 py-1 text-sm"
                  >
                    {LANGUAGE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{languageLabel(o.value)}</option>
                    ))}
                  </select>
                  <select
                    value={req.level}
                    onChange={(ev) => setLanguageReqs(languageReqs.map((r, idx) => idx === i ? { ...r, level: ev.target.value as LanguageLevel } : r))}
                    className="border border-border bg-background px-2 py-1 text-sm"
                  >
                    {LANGUAGE_LEVELS.map((lv) => (
                      <option key={lv} value={lv}>{t("sweep_engage.new_request.min_prefix")} {languageLevelLabel(lv)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setLanguageReqs(languageReqs.map((r, idx) => idx === i ? { ...r, hard: !r.hard } : r))}
                    className={`border px-2 py-1 text-[11px] font-bold uppercase ${req.hard ? "border-racing-red bg-racing-red/10 text-racing-red" : "border-border text-muted-foreground"}`}
                  >
                    {req.hard ? t("sweep_engage.new_request.hard") : t("sweep_engage.new_request.soft")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguageReqs(languageReqs.filter((_, idx) => idx !== i))}
                    className="border border-border px-3 py-1 text-[11px] font-bold uppercase text-muted-foreground hover:border-racing-red hover:text-racing-red"
                  >
                    {t("sweep_engage.new_request.remove")}
                  </button>
                  {req.code === "other" && (
                    <input
                      value={req.custom ?? ""}
                      onChange={(ev) => setLanguageReqs(languageReqs.map((r, idx) => idx === i ? { ...r, custom: ev.target.value } : r))}
                      placeholder={t("sweep_engage.new_request.language_name_placeholder")}
                      className="md:col-span-4 border border-border bg-background px-2 py-1 text-sm"
                    />
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                if (languageReqs.length >= MAX_REQUEST_LANGUAGES) return;
                setLanguageReqs([...languageReqs, { code: "en", level: "fluent", hard: true }]);
              }}
              disabled={languageReqs.length >= MAX_REQUEST_LANGUAGES}
              className="mt-2 border border-racing-red px-3 py-1 text-[11px] font-bold uppercase text-racing-red hover:bg-racing-red/10 disabled:opacity-40"
            >
              {languageReqs.length === 0 ? t("sweep_engage.new_request.add_language_req") : t("sweep_engage.new_request.add_another_language_req")}
            </button>
          </div>




          <div className="md:col-span-2">
            <label className="label-mono">{t("sweep_engage.new_request.notes")}</label>
            <textarea maxLength={1000} rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2" />
          </div>

          </fieldset>



          <button
            type="submit"
            disabled={mut.isPending || !canAfford || (isSeason && seasonDatesIso.length === 0)}
            className="md:col-span-2 bg-racing-red py-3 text-sm font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
          >
            {mut.isPending ? "…" : t("sweep_engage.new_request.post_for_tokens", { cost: displayCost, label: t("requests.post_for") })}
          </button>
        </form>
      </div>
      <SiteFooter />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="label-mono">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full border border-border bg-background px-3 py-2">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
