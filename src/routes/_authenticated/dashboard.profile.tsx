import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DIAL_CODES, DISCIPLINE_OPTIONS, EDUCATION_OPTIONS, EXPERIENCE_YEARS_OPTIONS, LANGUAGE_LEVELS, LANGUAGE_OPTIONS, MAX_FREELANCER_EXPERIENCES, MAX_FREELANCER_LANGUAGES, ROLE_OPTIONS, SKILL_OPTIONS, disciplineLabel, educationLabel, experienceYearsLabel, languageLabel, languageLevelLabel, roleLabel, skillLabel, type FreelancerExperience, type FreelancerLanguage, type LanguageLevel } from "@/lib/paddock";
import { updateMyDisplayName, updateMyFreelancerProfile, updateMyTeamProfile } from "@/lib/paddock.functions";
import { LocationAutocomplete } from "@/components/location-autocomplete";

export const Route = createFileRoute("/_authenticated/dashboard/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ["profile-detail", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: p, error: pError }, { data: fp, error: fpError }, { data: tp, error: tpError }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
        supabase.from("freelancer_profiles").select("*").eq("user_id", user!.id).maybeSingle(),
        supabase.from("team_profiles").select("*").eq("user_id", user!.id).maybeSingle(),
      ]);
      if (pError) throw new Error(pError.message);
      if (fpError) throw new Error(fpError.message);
      if (tpError) throw new Error(tpError.message);
      return { ...p, freelancerProfile: fp, teamProfile: tp };
    },
  });

  const isFreelancer = profile?.user_type === "freelancer";

  if (profileError) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="container-page py-12 text-sm text-racing-red">
          {profileError instanceof Error ? profileError.message : "Profile could not be loaded."}
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (profileLoading || !profile?.user_type) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="container-page py-12 text-sm text-muted-foreground">Loading…</div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="label-mono">[PROFILE]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("nav.profile")}</h1>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div className="border border-border bg-card p-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-racing-red">Personal Info</h2>
            <PersonalInfoSection profile={profile} />
          </div>

          <div className="border border-border bg-card p-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-racing-red">
              {isFreelancer ? "Freelancer Info" : "Team Info"}
            </h2>
            {isFreelancer ? (
              <FreelancerSection profile={profile?.freelancerProfile} />
            ) : (
              <TeamSection profile={profile?.teamProfile} />
            )}
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function PersonalInfoSection({ profile }: { profile: any }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const saveDisplayName = useServerFn(updateMyDisplayName);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (!editing && profile) setDisplayName(profile.display_name ?? "");
  }, [profile, editing]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      return saveDisplayName({ data: { display_name: displayName } });
    },
    onSuccess: (saved) => {
      qc.setQueryData(["profile-detail", user?.id], (old: any) => (old ? { ...old, ...saved } : old));
      qc.setQueryData(["profile-summary", user?.id], (old: any) => (old ? { ...old, ...saved } : old));
      qc.setQueryData(["dashboard-profile", user?.id], (old: any) => (old ? { ...old, ...saved } : old));
      qc.invalidateQueries({ queryKey: ["profile-detail", user?.id] });
      qc.invalidateQueries({ queryKey: ["profile-summary", user?.id] });
      qc.invalidateQueries({ queryKey: ["dashboard-profile", user?.id] });
      toast.success("Updated");
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="mt-4 space-y-3">
      <div className="text-sm">
        <span className="text-muted-foreground">Email:</span>
        <span className="ml-2 font-mono">{profile?.email ?? "—"}</span>
      </div>
      <div className="text-sm">
        <span className="text-muted-foreground">Account type:</span>
        <span className="ml-2 font-mono uppercase">{profile?.user_type ?? "—"}</span>
        <span className="ml-2 text-[11px] text-muted-foreground">(cannot be changed)</span>
      </div>
      {editing ? (
        <>
          <div>
            <label className="text-xs text-muted-foreground">
              {profile?.user_type === "team" ? "Team name" : "Display name"}
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-racing-red px-4 py-2 text-xs font-bold uppercase text-white">
              Save
            </button>
            <button onClick={() => setEditing(false)} className="border border-border px-4 py-2 text-xs font-bold uppercase">
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="text-sm">
            <span className="text-muted-foreground">Display name:</span>
            <span className="ml-2 font-mono">{profile?.display_name ?? "—"}</span>
          </div>
          <button onClick={() => setEditing(true)} className="text-xs text-racing-red hover:underline">
            Edit
          </button>
        </>
      )}
      <div className="text-sm">
        <span className="text-muted-foreground">Tokens:</span>
        <span className="ml-2 font-mono text-racing-red font-bold">{profile?.token_balance ?? 0}</span>
      </div>
    </div>
  );
}

function FreelancerSection({ profile }: { profile: any }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const saveFreelancerProfile = useServerFn(updateMyFreelancerProfile);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    role: "other" as string,
    headline: "",
    disciplines: [] as string[],
    skills: [] as string[],
    education: "" as string,
    day_rate: "" as string,
    location: "",
    bio: "",
    travels: true,
    phone_dial_code: "+39",
    phone_number: "",
    experiences: [] as FreelancerExperience[],
    languages: [] as FreelancerLanguage[],
  });

  // Sync form state whenever the underlying profile refreshes (query completes / refetches).
  useEffect(() => {
    if (editing) return;
    setForm({
      role: profile?.role ?? "other",
      headline: profile?.headline ?? "",
      disciplines: profile?.disciplines ?? [],
      skills: profile?.skills ?? [],
      education: profile?.education ?? "",
      day_rate: profile?.day_rate != null ? String(profile.day_rate) : "",
      location: profile?.location ?? "",
      bio: profile?.bio ?? "",
      travels: profile?.travels ?? true,
      phone_dial_code: profile?.phone_dial_code ?? "+39",
      phone_number: profile?.phone_number ?? "",
      experiences: Array.isArray(profile?.experiences)
        ? (profile.experiences as any[])
            .filter((e) => e && typeof e === "object" && typeof e.discipline === "string")
            .map((e) => ({ discipline: String(e.discipline), years: Number(e.years) || 0 }))
            .slice(0, MAX_FREELANCER_EXPERIENCES)
        : [],
      languages: Array.isArray(profile?.languages)
        ? (profile.languages as any[])
            .filter((l) => l && typeof l === "object" && typeof l.code === "string")
            .map((l) => ({ code: String(l.code), level: (String(l.level || "basic") as LanguageLevel), custom: l.custom ? String(l.custom) : undefined }))
            .slice(0, MAX_FREELANCER_LANGUAGES)
        : [],
    });
  }, [profile, editing]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      return saveFreelancerProfile({
        data: {
          role: form.role,
          headline: form.headline || null,
          disciplines: form.disciplines,
          skills: form.skills,
          education: form.education || null,
          day_rate: form.day_rate ? parseInt(form.day_rate) : null,
          location: form.location || null,
          bio: form.bio || null,
          travels: form.travels,
          experiences: form.experiences,
          languages: form.languages.map((l) => ({
            code: l.code,
            level: l.level,
            custom: l.code === "other" ? (l.custom ?? null) : null,
          })),
        },
      });
    },
    onSuccess: (saved) => {
      qc.setQueryData(["profile-detail", user?.id], (old: any) => (old ? { ...old, freelancerProfile: saved } : old));
      qc.invalidateQueries({ queryKey: ["profile-detail", user?.id] });
      toast.success("Freelancer profile saved");
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (editing) {
    return (
      <div className="mt-4 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground">Role</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm">
            {ROLE_OPTIONS.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Headline</label>
          <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. F1 Mechanic – 10 yrs" />
        </div>
        <MultiCheckboxBox label="Disciplines / Championships" options={DISCIPLINE_OPTIONS} value={form.disciplines} onChange={(v) => setForm({ ...form, disciplines: v })} />
        <MultiCheckboxBox label="Skills" options={SKILL_OPTIONS.map((o) => ({ value: o.value, label: skillLabel(o.value) }))} value={form.skills} onChange={(v) => setForm({ ...form, skills: v })} />
        <div>
          <label className="text-xs text-muted-foreground">{t("education.label")}</label>
          <select value={form.education} onChange={(e) => setForm({ ...form, education: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm">
            <option value="">{t("education.placeholder")}</option>
            {EDUCATION_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Day Rate (EUR)</label>
            <input type="number" value={form.day_rate} onChange={(e) => setForm({ ...form, day_rate: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm" placeholder="450" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Location</label>
            <LocationAutocomplete value={form.location} onChange={(v) => setForm({ ...form, location: v })} placeholder="Milan, Italy" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Bio</label>
          <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <ExperienceEditor
          value={form.experiences}
          onChange={(v) => setForm({ ...form, experiences: v })}
        />
        <LanguagesEditor
          value={form.languages}
          onChange={(v) => setForm({ ...form, languages: v })}
        />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.travels} onChange={(e) => setForm({ ...form, travels: e.target.checked })} className="accent-racing-red" />
          <span className="text-sm">Available to travel for race weekends</span>
        </label>
        <div className="flex gap-2">
          <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-racing-red px-4 py-2 text-xs font-bold uppercase text-white">Save</button>
          <button onClick={() => setEditing(false)} className="border border-border px-4 py-2 text-xs font-bold uppercase">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <Row label="Role" value={roleLabel(profile?.role)} />
      <Row label="Headline" value={profile?.headline ?? "—"} />
      <div>
        <div className="text-xs text-muted-foreground">Disciplines</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {profile?.disciplines?.length ? profile.disciplines.map((d: string) => (
            <span key={d} className="border border-racing-red/40 bg-racing-red/10 px-2 py-0.5 font-mono text-[10px] uppercase text-racing-red">{disciplineLabel(d)}</span>
          )) : <span className="text-sm">—</span>}
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Skills</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {profile?.skills?.length ? profile.skills.map((s: string) => (
            <span key={s} className="border border-border bg-secondary/40 px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{skillLabel(s)}</span>
          )) : <span className="text-sm">—</span>}
        </div>
      </div>
      <Row label="Day rate" value={profile?.day_rate ? `€${profile.day_rate}/day` : "—"} mono />
      <Row label="Location" value={profile?.location ?? "—"} />
      <Row label={t("education.label")} value={educationLabel(profile?.education)} />
      <Row label="Travels" value={profile?.travels ? "Yes" : "No"} />
      <div>
        <div className="text-xs text-muted-foreground">Motorsport experience</div>
        <div className="mt-1 space-y-1">
          {Array.isArray(profile?.experiences) && profile.experiences.length ? (
            profile.experiences.map((e: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="border border-racing-red/40 bg-racing-red/10 px-2 py-0.5 font-mono text-[10px] uppercase text-racing-red">{disciplineLabel(e.discipline)}</span>
                <span className="font-mono text-xs text-muted-foreground">{experienceYearsLabel(Number(e.years))}</span>
              </div>
            ))
          ) : (
            <span className="text-sm">—</span>
          )}
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Languages</div>
        <div className="mt-1 space-y-1">
          {Array.isArray(profile?.languages) && profile.languages.length ? (
            profile.languages.map((l: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="border border-border bg-secondary/40 px-2 py-0.5 font-mono text-[10px] uppercase">{languageLabel(l.code, l.custom)}</span>
                <span className="font-mono text-xs text-muted-foreground">{languageLevelLabel(l.level)}</span>
              </div>
            ))
          ) : (
            <span className="text-sm">—</span>
          )}
        </div>
      </div>
      <div className="text-sm"><span className="text-muted-foreground">Bio:</span><p className="mt-1">{profile?.bio ?? "—"}</p></div>
      <button onClick={() => setEditing(true)} className="mt-2 text-xs text-racing-red hover:underline">Edit Freelancer Info</button>
    </div>
  );
}

function TeamSection({ profile }: { profile: any }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const saveTeamProfile = useServerFn(updateMyTeamProfile);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    team_name: "",
    team_type: "",
    location: "",
    primary_discipline: "",
    bio: "",
    website: "",
  });

  useEffect(() => {
    if (editing) return;
    setForm({
      team_name: profile?.team_name ?? "",
      team_type: profile?.team_type ?? "",
      location: profile?.location ?? "",
      primary_discipline: profile?.primary_discipline ?? "",
      bio: profile?.bio ?? "",
      website: profile?.website ?? "",
    });
  }, [profile, editing]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      if (!form.team_name.trim()) throw new Error("Team name is required");
      return saveTeamProfile({
        data: {
          team_name: form.team_name,
          team_type: form.team_type || null,
          location: form.location || null,
          primary_discipline: form.primary_discipline || null,
          bio: form.bio || null,
          website: form.website || null,
        },
      });
    },
    onSuccess: (saved) => {
      qc.setQueryData(["profile-detail", user?.id], (old: any) => (old ? { ...old, teamProfile: saved } : old));
      qc.invalidateQueries({ queryKey: ["profile-detail", user?.id] });
      qc.invalidateQueries({ queryKey: ["profile-summary", user?.id] });
      qc.invalidateQueries({ queryKey: ["dashboard-profile", user?.id] });
      toast.success("Team profile saved");
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (editing) {
    return (
      <div className="mt-4 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground">Team Name</label>
          <input value={form.team_name} onChange={(e) => setForm({ ...form, team_name: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Team Type</label>
          <input value={form.team_type} onChange={(e) => setForm({ ...form, team_type: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. F2 Team, GT Team, Factory" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Location</label>
          <LocationAutocomplete value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Primary Discipline</label>
          <select value={form.primary_discipline} onChange={(e) => setForm({ ...form, primary_discipline: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm">
            <option value="">Select…</option>
            {DISCIPLINE_OPTIONS.map((d) => (<option key={d.value} value={d.value}>{d.label}</option>))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Bio</label>
          <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Website</label>
          <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm" placeholder="https://…" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-racing-red px-4 py-2 text-xs font-bold uppercase text-white">Save</button>
          <button onClick={() => setEditing(false)} className="border border-border px-4 py-2 text-xs font-bold uppercase">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <Row label="Team name" value={profile?.team_name ?? "—"} bold />
      <Row label="Type" value={profile?.team_type ?? "—"} />
      <Row label="Location" value={profile?.location ?? "—"} />
      <Row label="Discipline" value={disciplineLabel(profile?.primary_discipline)} mono />
      <div className="text-sm">
        <span className="text-muted-foreground">Website:</span>
        <span className="ml-2">{profile?.website ? <a href={profile.website} target="_blank" rel="noopener" className="text-racing-red hover:underline">{profile.website}</a> : "—"}</span>
      </div>
      <div className="text-sm"><span className="text-muted-foreground">Bio:</span><p className="mt-1">{profile?.bio ?? "—"}</p></div>
      <button onClick={() => setEditing(true)} className="mt-2 text-xs text-racing-red hover:underline">Edit Team Info</button>
    </div>
  );
}

function Row({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <span className={`ml-2 ${mono ? "font-mono" : ""} ${bold ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}

function MultiCheckboxBox({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const allSelected = filtered.length > 0 && filtered.every((o) => value.includes(o.value));
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-muted-foreground">{label} <span className="text-racing-red">({value.length})</span></label>
        <button
          type="button"
          onClick={() => {
            const filteredVals = filtered.map((o) => o.value);
            if (allSelected) onChange(value.filter((v) => !filteredVals.includes(v)));
            else onChange(Array.from(new Set([...value, ...filteredVals])));
          }}
          className="text-[10px] font-bold uppercase text-racing-red hover:underline"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter…"
        className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs"
      />
      <div className="mt-1 max-h-56 overflow-y-auto border border-border p-2">
        <div className="flex flex-wrap gap-1.5">
          {filtered.map((o) => {
            const checked = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(checked ? value.filter((v) => v !== o.value) : [...value, o.value])}
                className={`border px-2 py-1 text-[11px] transition-colors ${checked ? "border-racing-red bg-racing-red/10 text-racing-red" : "border-border hover:bg-secondary"}`}
              >
                {o.label}
              </button>
            );
          })}
          {filtered.length === 0 && <div className="text-xs text-muted-foreground">No matches.</div>}
        </div>
      </div>
    </div>
  );
}

function ExperienceEditor({
  value,
  onChange,
}: {
  value: FreelancerExperience[];
  onChange: (v: FreelancerExperience[]) => void;
}) {
  const canAdd = value.length < MAX_FREELANCER_EXPERIENCES;
  const update = (i: number, patch: Partial<FreelancerExperience>) => {
    const next = value.map((e, idx) => (idx === i ? { ...e, ...patch } : e));
    onChange(next);
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => {
    if (!canAdd) return;
    onChange([...value, { discipline: DISCIPLINE_OPTIONS[0].value, years: 1 }]);
  };
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-muted-foreground">
          Motorsport experience <span className="text-racing-red">({value.length}/{MAX_FREELANCER_EXPERIENCES})</span>
        </label>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Add up to {MAX_FREELANCER_EXPERIENCES} past championships/categories and the years you spent in each. Pick "No experience" if you're new to motorsport.
      </p>
      <div className="mt-2 space-y-2">
        {value.map((e, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 border border-border bg-background/40 p-2 sm:grid-cols-[1fr_140px_auto]">
            <select
              value={e.discipline}
              onChange={(ev) => update(i, { discipline: ev.target.value })}
              className="border border-border bg-background px-2 py-1 text-sm"
            >
              {DISCIPLINE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={String(e.years)}
              onChange={(ev) => update(i, { years: parseInt(ev.target.value) })}
              className="border border-border bg-background px-2 py-1 text-sm"
            >
              {EXPERIENCE_YEARS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => remove(i)}
              className="border border-border px-3 py-1 text-[11px] font-bold uppercase text-muted-foreground hover:border-racing-red hover:text-racing-red"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        disabled={!canAdd}
        className="mt-2 border border-racing-red px-3 py-1 text-[11px] font-bold uppercase text-racing-red hover:bg-racing-red/10 disabled:opacity-40"
      >
        {value.length === 0 ? "+ Add experience" : "+ Add another experience"}
      </button>
    </div>
  );
}

function LanguagesEditor({
  value,
  onChange,
}: {
  value: FreelancerLanguage[];
  onChange: (v: FreelancerLanguage[]) => void;
}) {
  const canAdd = value.length < MAX_FREELANCER_LANGUAGES;
  const update = (i: number, patch: Partial<FreelancerLanguage>) => {
    onChange(value.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => {
    if (!canAdd) return;
    const used = new Set(value.map((l) => l.code));
    const nextCode = LANGUAGE_OPTIONS.find((o) => !used.has(o.value))?.value ?? "en";
    onChange([...value, { code: nextCode, level: "intermediate" }]);
  };
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-muted-foreground">
          Languages spoken <span className="text-racing-red">({value.length}/{MAX_FREELANCER_LANGUAGES})</span>
        </label>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Pick each language you speak and its level. Teams can require specific languages on their job requests.
      </p>
      <div className="mt-2 space-y-2">
        {value.map((l, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 border border-border bg-background/40 p-2 sm:grid-cols-[1fr_1fr_auto]">
            <select
              value={l.code}
              onChange={(ev) => update(i, { code: ev.target.value })}
              className="border border-border bg-background px-2 py-1 text-sm"
            >
              {LANGUAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{languageLabel(o.value)}</option>
              ))}
            </select>
            <select
              value={l.level}
              onChange={(ev) => update(i, { level: ev.target.value as LanguageLevel })}
              className="border border-border bg-background px-2 py-1 text-sm"
            >
              {LANGUAGE_LEVELS.map((lv) => (
                <option key={lv} value={lv}>{languageLevelLabel(lv)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => remove(i)}
              className="border border-border px-3 py-1 text-[11px] font-bold uppercase text-muted-foreground hover:border-racing-red hover:text-racing-red"
            >
              Remove
            </button>
            {l.code === "other" && (
              <input
                value={l.custom ?? ""}
                onChange={(ev) => update(i, { custom: ev.target.value })}
                placeholder="Language name"
                className="sm:col-span-3 border border-border bg-background px-2 py-1 text-sm"
              />
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        disabled={!canAdd}
        className="mt-2 border border-racing-red px-3 py-1 text-[11px] font-bold uppercase text-racing-red hover:bg-racing-red/10 disabled:opacity-40"
      >
        {value.length === 0 ? "+ Add language" : "+ Add another language"}
      </button>
    </div>
  );
}
