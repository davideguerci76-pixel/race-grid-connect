import { getMyPitCode } from "@/lib/pool.functions";
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
import { useTaxonomy } from "@/lib/use-taxonomy";
import { ROLE_GROUPS, SUB_ROLE_LEVELS, levelLabel, parseSubRoles, roleGroupLabel, skillsForGroup, subRoleLabel, subRolesForGroup, type FreelancerSubRole, type SubRoleLevel } from "@/lib/roles";
import { DIAL_CODES, DISCIPLINE_OPTIONS, EDUCATION_OPTIONS, EXPERIENCE_YEARS_OPTIONS, LANGUAGE_LEVELS, LANGUAGE_OPTIONS, MAX_FREELANCER_EXPERIENCES, MAX_FREELANCER_LANGUAGES, SKILL_OPTIONS, disciplineLabel, educationLabel, experienceYearsLabel, languageLabel, languageLevelLabel, skillLabel, type FreelancerExperience, type FreelancerLanguage, type LanguageLevel } from "@/lib/paddock";
import { setMyLegalName } from "@/lib/identity.functions";
import { isValidVat, VAT_PLACEHOLDER } from "@/lib/vat";
import { updateMyDisplayName, updateMyFreelancerProfile, updateMyPhone, updateMyTeamProfile, getUserRatingSummary } from "@/lib/paddock.functions";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import { RatingIcons } from "@/components/rating-icons";
import { AnonymousReviewsSection } from "@/components/anonymous-reviews";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BackButton } from "@/components/back-button";
import { PrivacyDataSection } from "@/components/privacy-data-section";
import { toastError } from "@/lib/errors";
import { PitcallErrorScreen } from "@/components/pitcall-error-screen";
import { FREELANCER_PROFILE_COLUMNS, TEAM_PROFILE_COLUMNS } from "@/lib/profile-columns";


export const Route = createFileRoute("/_authenticated/dashboard/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const { data: profile, isLoading: profileLoading, error: profileError, refetch: refetchProfile } = useQuery({
    queryKey: ["profile-detail", user?.id],
    enabled: !!user,
    retry: false,
    queryFn: async () => {
      const { data: p, error: pError } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      if (pError) throw new Error(pError.message);

      const isTeam = p?.user_type === "team";

      if (isTeam) {
        // Only the non-sensitive columns are readable; `select("*")` would hit the
        // owner-only VAT column and fail with a raw permission error.
        const [{ data: tp, error: tpError }, vatRes, coordsRes] = await Promise.all([
          supabase
            .from("team_profiles")
            .select(TEAM_PROFILE_COLUMNS)
            .eq("user_id", user!.id)
            .maybeSingle(),
          (supabase.rpc as any)("my_team_vat"),
          (supabase.rpc as any)("my_profile_coords"),
        ]);
        if (tpError) throw new Error(tpError.message);
        const teamCoords = Array.isArray(coordsRes?.data) ? coordsRes.data[0] : null;
        const tpWithVat = tp
          ? {
              ...tp,
              vat_number: (vatRes?.data as string | null) ?? null,
              location_lat: teamCoords?.location_lat ?? null,
              location_lng: teamCoords?.location_lng ?? null,
            }
          : tp;
        return { ...p, freelancerProfile: null as any, teamProfile: tpWithVat };
      }

      const [{ data: fp, error: fpError }, phoneRes, coordsRes, rateRes, muteRes] = await Promise.all([
        supabase.from("freelancer_profiles").select(FREELANCER_PROFILE_COLUMNS).eq("user_id", user!.id).maybeSingle(),
        supabase.rpc("my_freelancer_phone"),
        (supabase.rpc as any)("my_profile_coords"),
        (supabase.rpc as any)("my_day_rate"),
        (supabase.rpc as any)("my_availability_opportunity_mute"),
      ]);
      if (fpError) throw new Error(fpError.message);
      // Phone lives outside the broadly-readable freelancer_profiles columns; merge in owner-only phone data here.
      const phoneRow = Array.isArray(phoneRes?.data) ? phoneRes.data[0] : null;
      const coordsRow = Array.isArray(coordsRes?.data) ? coordsRes.data[0] : null;
      // day_rate / currency and the mute preference are owner-only: read via RPC.
      const rateRow = Array.isArray(rateRes?.data) ? (rateRes.data[0] as any) : null;
      const muteRow = Array.isArray(muteRes?.data) ? (muteRes.data[0] as any) : null;
      const fpWithPhone = fp
        ? {
            ...(fp as any),
            phone_dial_code: phoneRow?.phone_dial_code ?? null,
            phone_number: phoneRow?.phone_number ?? null,
            location_lat: coordsRow?.location_lat ?? null,
            location_lng: coordsRow?.location_lng ?? null,
            day_rate: rateRow?.day_rate ?? null,
            currency: rateRow?.currency ?? null,
            mute_availability_opportunities: muteRow?.mute_availability_opportunities ?? false,
          }
        : fp;
      return { ...p, freelancerProfile: fpWithPhone, teamProfile: null as any };
    },
  });

  const isFreelancer = profile?.user_type === "freelancer";

  useEffect(() => {
    if (profileError) toastError(profileError, "errors.server", { route: "/dashboard/profile" });
  }, [profileError]);

  if (profileError) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <PitcallErrorScreen
          code="500"
          titleKey="errors.screens.crashTitle"
          bodyKey="errors.server"
          onRetry={() => void refetchProfile()}
        />
        <SiteFooter />
      </div>
    );
  }


  if (profileLoading || !profile?.user_type) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="container-page pt-6"><BackButton /></div>
        <div className="container-page py-12 text-sm text-muted-foreground">{t("sweep_profile.profile.loading")}</div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page py-12">
        <div className="grid min-w-0 grid-cols-1 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className="label-mono">[PROFILE]</div>
            <h1 className="max-w-full text-3xl font-black uppercase italic leading-tight sm:text-4xl">{t("nav.profile")}</h1>
          </div>
          {user?.id && <ProfileRatingBadge userId={user.id} isFreelancer={isFreelancer} />}
        </div>

        <div className="mt-8 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:gap-8 md:grid-cols-2">
          <div className="min-w-0 border border-border bg-card p-4 sm:p-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-racing-red">{t("sweep_profile.profile.personal_info")}</h2>
            <PersonalInfoSection profile={profile} />
          </div>

          <div className="min-w-0 border border-border bg-card p-4 sm:p-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-racing-red">
              {isFreelancer ? t("sweep_profile.profile.freelancer_info") : t("sweep_profile.profile.team_info")}
            </h2>
            {isFreelancer ? (
              <FreelancerSection profile={profile?.freelancerProfile} />
            ) : (
              <TeamSection profile={profile?.teamProfile} />
            )}
          </div>
        </div>

        <div className="mt-8">
          <PrivacyDataSection />
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
function ProfileRatingBadge({ userId, isFreelancer }: { userId: string; isFreelancer: boolean }) {
  const { t } = useTranslation();
  const getSummary = useServerFn(getUserRatingSummary);
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["profile-rating-summary", userId],
    queryFn: () => getSummary({ data: { user_id: userId } }),
  });
  if (!data || !data.count) {
    return (
      <div className="border border-border bg-card px-4 py-3 text-right">
        <div className="label-mono text-[10px]">[RATING]</div>
        <div className="mt-1 font-mono text-[11px] text-muted-foreground">{t("sweep_profile.profile.no_ratings_yet")}</div>
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border border-racing-yellow/50 bg-racing-yellow/5 px-4 py-3 text-right transition hover:bg-racing-yellow/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-racing-yellow"
        title={t("reviews.view_mine", { defaultValue: "View my reviews" }) as string}
      >
        <div className="label-mono text-[10px] text-racing-yellow">[OVERALL RATING]</div>
        <div className="mt-1 flex items-center justify-end gap-2">
          <RatingIcons value={data.average} count={data.count} variant={isFreelancer ? "wrench" : "headset"} size={18} />
        </div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("reviews.click_to_view", { defaultValue: "Click to view reviews" })}
        </div>
      </button>
      <ReviewsDialog
        open={open}
        onOpenChange={setOpen}
        userId={userId}
        variant={isFreelancer ? "wrench" : "headset"}
      />
    </>
  );
}

function ReviewsDialog({
  open,
  onOpenChange,
  userId,
  variant,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  variant: "wrench" | "headset";
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-xs uppercase tracking-widest text-racing-red">
            {t("reviews.my_reviews", { defaultValue: "Reviews received" })}
          </DialogTitle>
        </DialogHeader>
        <AnonymousReviewsSection targetUserId={userId} variant={variant} isOwner />
      </DialogContent>
    </Dialog>
  );
}



function PersonalInfoSection({ profile }: { profile: any }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const saveDisplayName = useServerFn(updateMyDisplayName);
  const savePhone = useServerFn(updateMyPhone);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDial, setPhoneDial] = useState("+39");
  const [phoneNumber, setPhoneNumber] = useState("");

  const isFreelancer = profile?.user_type === "freelancer";
  const fp = profile?.freelancerProfile;

  useEffect(() => {
    if (!editing && profile) setDisplayName(profile.display_name ?? "");
  }, [profile, editing]);

  useEffect(() => {
    if (!editingPhone) {
      setPhoneDial(fp?.phone_dial_code ?? "+39");
      setPhoneNumber(fp?.phone_number ?? "");
    }
  }, [fp, editingPhone]);

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
      toast.success(t("sweep_profile.common.updated"));
      setEditing(false);
    },
    onError: (e) => toastError(e, "sweep_profile.common.failed"),
  });

  const phoneMutation = useMutation({
    mutationFn: async () => {
      // Client-side validation with a localized message — mirrors the server-side zod check.
      const dialOk = /^\+\d{1,4}$/.test(phoneDial.trim());
      const numTrim = phoneNumber.trim();
      const numOk = numTrim.length >= 4 && numTrim.length <= 30 && /^[0-9 ()\-./]+$/.test(numTrim);
      if (!dialOk || !numOk) throw new Error(t("phone.invalid"));
      return savePhone({ data: { phone_dial_code: phoneDial.trim(), phone_number: numTrim } });
    },
    onSuccess: () => {
      qc.setQueryData(["profile-detail", user?.id], (old: any) =>
        old ? { ...old, freelancerProfile: { ...(old.freelancerProfile ?? {}), phone_dial_code: phoneDial.trim(), phone_number: phoneNumber.trim() } } : old,
      );
      qc.invalidateQueries({ queryKey: ["profile-detail", user?.id] });
      toast.success(t("phone.save"));
      setEditingPhone(false);
    },
    onError: (e) => {
      // Server-side zod failures come through with the "INVALID_PHONE" sentinel — always show the localized copy.
      const raw = e instanceof Error ? e.message : "";
      toast.error(raw && !raw.includes("INVALID_PHONE") && !raw.includes("Phone number") && !raw.includes("Invalid") ? raw : t("phone.invalid"));
    },
  });

  return (
    <div className="mt-4 space-y-3">
      <div className="min-w-0 text-sm">
        <span className="text-muted-foreground">{t("sweep_profile.profile.email")}:</span>
        <span className="ml-2 font-mono break-all">{user?.email ?? "—"}</span>
      </div>
      {isFreelancer && <LegalNameBlock profile={profile} />}
      {isFreelancer && <PitCodeBlock />}
      <div className="text-sm">
        <span className="text-muted-foreground">{t("profile.account_type")}:</span>
        <span className="ml-2 break-words font-mono uppercase">{profile?.user_type ?? "—"}</span>
        <span className="ml-2 break-words text-[11px] text-muted-foreground">({t("profile.cannot_be_changed")})</span>
      </div>
      {!isFreelancer && (editing ? (
        <>
          <div>
            <label className="text-xs text-muted-foreground">
              {t("sweep_profile.profile.team_name")}
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-racing-red px-4 py-2 text-xs font-bold uppercase text-white">
              {t("sweep_profile.common.save")}
            </button>
            <button onClick={() => setEditing(false)} className="border border-border px-4 py-2 text-xs font-bold uppercase">
              {t("sweep_profile.common.cancel")}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="text-sm">
            <span className="text-muted-foreground">{t("sweep_profile.profile.team_name")}:</span>
            <span className="ml-2 font-mono">{profile?.display_name ?? "—"}</span>
          </div>
          <button onClick={() => setEditing(true)} className="text-xs text-racing-red hover:underline">
            {t("sweep_profile.common.edit")}
          </button>
        </>
      ))}


      <div className="text-sm">
        <span className="text-muted-foreground">{t("sweep_profile.profile.tokens_label")}:</span>
        <span className="ml-2 font-mono text-racing-red font-bold">{profile?.token_balance ?? 0}</span>
      </div>

      {isFreelancer && (
        <div className="border-t border-border pt-3">
          {editingPhone ? (
            <>
              <label className="text-xs text-muted-foreground">{t("phone.label")}</label>
              <div className="mt-1 flex gap-2">
                <select
                  value={phoneDial}
                  onChange={(e) => setPhoneDial(e.target.value)}
                  className="w-32 min-w-0 border border-border bg-background px-2 py-2 text-sm"
                >
                  {DIAL_CODES.map((d) => (<option key={d.code} value={d.code}>{d.label}</option>))}
                </select>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="flex-1 min-w-0 border border-border bg-background px-3 py-2 text-sm"
                  placeholder={t("sweep_profile.profile.phone_placeholder")}
                />
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => phoneMutation.mutate()} disabled={phoneMutation.isPending} className="bg-racing-red px-4 py-2 text-xs font-bold uppercase text-white">
                  {t("phone.save")}
                </button>
                <button onClick={() => setEditingPhone(false)} className="border border-border px-4 py-2 text-xs font-bold uppercase">
                  {t("sweep_profile.common.cancel")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-sm">
                <span className="text-muted-foreground">{t("phone.label")}:</span>
                <span className="ml-2 font-mono">{fp?.phone_number ? `${fp.phone_dial_code ?? ""} ${fp.phone_number}`.trim() : "—"}</span>
              </div>
              <button onClick={() => setEditingPhone(true)} className="mt-1 text-xs text-racing-red hover:underline">
                {t("phone.edit")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FreelancerSection({ profile }: { profile: any }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const saveFreelancerProfile = useServerFn(updateMyFreelancerProfile);
  const [editing, setEditing] = useState(false);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const tax = useTaxonomy();
  const [form, setForm] = useState({
    role_group: "" as string,
    sub_roles: [] as FreelancerSubRole[],
    headline: "",
    disciplines: [] as string[],
    skills: [] as string[],
    education: "" as string,
    day_rate: "" as string,
    location: "",
    location_lat: null as number | null,
    location_lng: null as number | null,
    location_city: null as string | null,
    location_region: null as string | null,
    location_country: null as string | null,
    location_place_id: null as string | null,
    bio: "",
    travels: true,
    mute_availability_opportunities: false,
    experiences: [] as FreelancerExperience[],
    languages: [] as FreelancerLanguage[],
  });

  // Sync form state whenever the underlying profile refreshes (query completes / refetches).
  useEffect(() => {
    if (editing) return;
    setForm({
      role_group: profile?.role_group ?? "",
      sub_roles: parseSubRoles(profile?.sub_roles),
      headline: profile?.headline ?? "",
      disciplines: profile?.disciplines ?? [],
      skills: profile?.skills ?? [],
      education: profile?.education ?? "",
      day_rate: profile?.day_rate != null ? String(profile.day_rate) : "",
      location: profile?.location ?? "",
      location_lat: (profile as any)?.location_lat ?? null,
      location_lng: (profile as any)?.location_lng ?? null,
      location_city: (profile as any)?.location_city ?? null,
      location_region: (profile as any)?.location_region ?? null,
      location_country: (profile as any)?.location_country ?? null,
      location_place_id: (profile as any)?.location_place_id ?? null,
      bio: profile?.bio ?? "",
      travels: profile?.travels ?? true,
      mute_availability_opportunities: profile?.mute_availability_opportunities ?? false,
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
          role_group: form.role_group,
          sub_roles: form.sub_roles,
          headline: form.headline || null,
          disciplines: form.disciplines,
          skills: form.skills,
          education: form.education || null,
          day_rate: form.day_rate ? parseInt(form.day_rate) : null,
          location: form.location || null,
          location_lat: form.location_lat ?? null,
          location_lng: form.location_lng ?? null,
          location_city: form.location_city,
          location_region: form.location_region,
          location_country: form.location_country,
          location_place_id: form.location_place_id,
          bio: form.bio || null,
          travels: form.travels,
          mute_availability_opportunities: form.mute_availability_opportunities,
          experiences: form.experiences,
          languages: form.languages.map((l) => ({
            code: l.code,
            level: l.level,
            custom: l.code === "other" ? (l.custom ?? null) : null,
          })),
        },
      });
    },
    onSuccess: (saved: any) => {
      qc.setQueryData(["profile-detail", user?.id], (old: any) =>
        old ? { ...old, freelancerProfile: { ...(old.freelancerProfile ?? {}), ...(saved ?? {}) } } : old,
      );
      qc.invalidateQueries({ queryKey: ["profile-detail", user?.id] });
      toast.success(t("sweep_profile.freelancer.saved"));
      setEditing(false);
    },
    onError: (e) => toastError(e, "sweep_profile.common.failed"),
  });

  if (editing) {
    return (
      <div className="mt-4 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground">{t("sweep_profile.freelancer.macro_role")}</label>
          <select
            value={form.role_group}
            onChange={(e) => setForm({ ...form, role_group: e.target.value, sub_roles: [] })}
            className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t("sweep_profile.freelancer.select_macro_role")}</option>
            {tax.roleGroups.map((g) => (<option key={g.value} value={g.value}>{roleGroupLabel(g.value)}</option>))}
          </select>
        </div>
        <SubRolesEditor
          group={form.role_group}
          value={form.sub_roles}
          onChange={(v) => setForm({ ...form, sub_roles: v })}
        />
        <div>
          <label className="text-xs text-muted-foreground">{t("sweep_profile.freelancer.headline")}</label>
          <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm" placeholder={t("sweep_profile.freelancer.headline_placeholder")} />
        </div>
        <MultiCheckboxBox label={t("sweep_profile.freelancer.disciplines")} options={tax.disciplines.map((d) => ({ value: d, label: disciplineLabel(d) }))} value={form.disciplines} onChange={(v) => setForm({ ...form, disciplines: v })} />
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {showAllSkills || !form.role_group ? t("sweep_profile.freelancer.all_skills") : t("sweep_profile.freelancer.skills_for_role")}
            </span>
            <button
              type="button"
              onClick={() => setShowAllSkills((v) => !v)}
              className="font-mono text-[10px] uppercase tracking-widest text-racing-red hover:underline"
            >
              {showAllSkills ? t("sweep_profile.freelancer.show_macro_skills") : t("sweep_profile.freelancer.show_all_skills")}
            </button>
          </div>
          <MultiCheckboxBox
            label={t("sweep_profile.freelancer.skills")}
            options={(showAllSkills || !form.role_group
              ? tax.allSkills
              : tax.skillsFor(form.role_group)
            ).map((v) => ({ value: v, label: skillLabel(v) }))}
            value={form.skills}
            onChange={(v) => setForm({ ...form, skills: v })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t("education.label")}</label>
          <select value={form.education} onChange={(e) => setForm({ ...form, education: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm">
            <option value="">{t("education.placeholder")}</option>
            {EDUCATION_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">{t("sweep_profile.freelancer.day_rate")}</label>
            <input type="number" value={form.day_rate} onChange={(e) => setForm({ ...form, day_rate: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm" placeholder="450" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("sweep_profile.freelancer.location")}</label>
            <LocationAutocomplete
              value={form.location}
              onChange={(v) => setForm({ ...form, location: v, location_lat: null, location_lng: null, location_city: null, location_region: null, location_country: null, location_place_id: null })}
              onPick={(p) => setForm({ ...form, location: p.text, location_lat: p.lat, location_lng: p.lng, location_city: p.city, location_region: p.region, location_country: p.country, location_place_id: p.placeId })}
              placeholder={t("sweep_profile.freelancer.location_placeholder")}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t("sweep_profile.common.bio")}</label>
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
          <span className="text-sm">{t("sweep_profile.freelancer.travels_label")}</span>
        </label>
        <div className="border-t border-border pt-3">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={form.mute_availability_opportunities}
              onChange={(e) => setForm({ ...form, mute_availability_opportunities: e.target.checked })}
              className="mt-0.5 accent-racing-red"
            />
            <span className="text-sm">{t("sweep_profile.freelancer.mute_availability_opportunities")}</span>
          </label>
          <p className="mt-1 pl-6 text-xs text-muted-foreground">
            {t("sweep_profile.freelancer.mute_availability_opportunities_hint")}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-racing-red px-4 py-2 text-xs font-bold uppercase text-white">{t("sweep_profile.common.save")}</button>
          <button onClick={() => setEditing(false)} className="border border-border px-4 py-2 text-xs font-bold uppercase">{t("sweep_profile.common.cancel")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <Row label={t("sweep_profile.freelancer.macro_role")} value={roleGroupLabel(profile?.role_group)} />
      <div>
        <div className="text-xs text-muted-foreground">{t("sweep_profile.freelancer.sub_roles")}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {parseSubRoles(profile?.sub_roles).length ? parseSubRoles(profile?.sub_roles).map((sr) => (
            <span key={sr.sub_role} className="border border-racing-yellow/40 bg-racing-yellow/10 px-2 py-0.5 font-mono text-[10px] uppercase text-racing-yellow">
              {subRoleLabel(sr.sub_role)} · {levelLabel(sr.level)}
            </span>
          )) : <span className="text-sm">—</span>}
        </div>
      </div>
      <Row label={t("sweep_profile.freelancer.headline")} value={profile?.headline ?? "—"} />
      <div>
        <div className="text-xs text-muted-foreground">{t("sweep_profile.freelancer.disciplines")}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {profile?.disciplines?.length ? profile.disciplines.map((d: string) => (
            <span key={d} className="border border-racing-red/40 bg-racing-red/10 px-2 py-0.5 font-mono text-[10px] uppercase text-racing-red">{disciplineLabel(d)}</span>
          )) : <span className="text-sm">—</span>}
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{t("sweep_profile.freelancer.skills")}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {profile?.skills?.length ? profile.skills.map((s: string) => (
            <span key={s} className="border border-border bg-secondary/40 px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{skillLabel(s)}</span>
          )) : <span className="text-sm">—</span>}
        </div>
      </div>
      <Row label={t("sweep_profile.freelancer.day_rate")} value={profile?.day_rate ? t("sweep_profile.freelancer.day_rate_value", { rate: profile.day_rate }) : "—"} mono />
      <Row label={t("sweep_profile.freelancer.location")} value={profile?.location ?? "—"} />
      
      <Row label={t("education.label")} value={educationLabel(profile?.education)} />
      <Row label={t("sweep_profile.freelancer.travels")} value={profile?.travels ? t("sweep_profile.common.yes") : t("sweep_profile.common.no")} />
      <Row
        label={t("sweep_profile.freelancer.mute_availability_opportunities")}
        value={profile?.mute_availability_opportunities ? t("sweep_profile.common.yes") : t("sweep_profile.common.no")}
      />
      <div>
        <div className="text-xs text-muted-foreground">{t("sweep_profile.freelancer.motorsport_experience")}</div>
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
        <div className="text-xs text-muted-foreground">{t("sweep_profile.freelancer.languages")}</div>
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
      <div className="text-sm"><span className="text-muted-foreground">{t("sweep_profile.common.bio")}:</span><p className="mt-1">{profile?.bio ?? "—"}</p></div>
      <button onClick={() => setEditing(true)} className="mt-2 text-xs text-racing-red hover:underline">{t("sweep_profile.freelancer.edit_info")}</button>
    </div>
  );
}

function TeamSection({ profile }: { profile: any }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const saveTeamProfile = useServerFn(updateMyTeamProfile);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    team_name: "",
    vat_number: "",
    team_type: "",
    location: "",
    location_lat: null as number | null,
    location_lng: null as number | null,
    location_city: null as string | null,
    location_region: null as string | null,
    location_country: null as string | null,
    location_place_id: null as string | null,
    primary_discipline: "",
    bio: "",
    website: "",
  });

  useEffect(() => {
    if (editing) return;
    setForm({
      team_name: profile?.team_name ?? "",
      vat_number: (profile as any)?.vat_number ?? "",
      team_type: profile?.team_type ?? "",
      location: profile?.location ?? "",
      location_lat: (profile as any)?.location_lat ?? null,
      location_lng: (profile as any)?.location_lng ?? null,
      location_city: (profile as any)?.location_city ?? null,
      location_region: (profile as any)?.location_region ?? null,
      location_country: (profile as any)?.location_country ?? null,
      location_place_id: (profile as any)?.location_place_id ?? null,
      primary_discipline: profile?.primary_discipline ?? "",
      bio: profile?.bio ?? "",
      website: profile?.website ?? "",
    });
  }, [profile, editing]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      if (!form.team_name.trim()) throw new Error(t("team.name_required"));
      if (!isValidVat(form.vat_number)) throw new Error(t("team.vat_invalid"));
      return saveTeamProfile({
        data: {
          team_name: form.team_name,
          vat_number: form.vat_number,
          team_type: form.team_type || null,
          location: form.location || null,
          location_lat: form.location_lat ?? null,
          location_lng: form.location_lng ?? null,
          location_city: form.location_city,
          location_region: form.location_region,
          location_country: form.location_country,
          location_place_id: form.location_place_id,
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
      toast.success(t("sweep_profile.team.saved"));
      setEditing(false);
    },
    onError: (e) => toastError(e, "sweep_profile.common.failed"),
  });

  if (editing) {
    return (
      <div className="mt-4 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground">{t("sweep_profile.team.team_name")}</label>
          <input value={form.team_name} onChange={(e) => setForm({ ...form, team_name: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t("team.vat")} <span className="text-racing-red">*</span></label>
          <input
            value={form.vat_number}
            onChange={(e) => setForm({ ...form, vat_number: e.target.value })}
            placeholder={VAT_PLACEHOLDER}
            className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm uppercase"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">{t("team.vat_hint")}</p>
          {form.vat_number.trim().length > 0 && !isValidVat(form.vat_number) && (
            <p className="mt-1 text-[11px] text-racing-red">{t("team.vat_invalid")}</p>
          )}
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t("sweep_profile.team.team_type")}</label>
          <input value={form.team_type} onChange={(e) => setForm({ ...form, team_type: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm" placeholder={t("sweep_profile.team.team_type_placeholder")} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t("sweep_profile.freelancer.location")}</label>
          <LocationAutocomplete
            value={form.location}
            onChange={(v) => setForm({ ...form, location: v, location_lat: null, location_lng: null, location_city: null, location_region: null, location_country: null, location_place_id: null })}
            onPick={(p) => setForm({ ...form, location: p.text, location_lat: p.lat, location_lng: p.lng, location_city: p.city, location_region: p.region, location_country: p.country, location_place_id: p.placeId })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t("sweep_profile.team.primary_discipline")}</label>
          <select value={form.primary_discipline} onChange={(e) => setForm({ ...form, primary_discipline: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm">
            <option value="">{t("sweep_profile.common.select")}</option>
            {DISCIPLINE_OPTIONS.map((d) => (<option key={d.value} value={d.value}>{d.label}</option>))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t("sweep_profile.common.bio")}</label>
          <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t("sweep_profile.team.website")}</label>
          <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm" placeholder={t("sweep_profile.team.website_placeholder")} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-racing-red px-4 py-2 text-xs font-bold uppercase text-white">{t("sweep_profile.common.save")}</button>
          <button onClick={() => setEditing(false)} className="border border-border px-4 py-2 text-xs font-bold uppercase">{t("sweep_profile.common.cancel")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <Row label={t("team.name")} value={profile?.team_name ?? "—"} bold />
      <Row label={t("team.vat")} value={(profile as any)?.vat_number ?? "—"} mono />
      {!(profile as any)?.vat_number && (
        <p className="border border-racing-red/50 bg-racing-red/10 p-2 text-[11px] text-racing-red">{t("team.vat_required_banner")}</p>
      )}
      <Row label={t("sweep_profile.team.type")} value={profile?.team_type ?? "—"} />
      <Row label={t("sweep_profile.freelancer.location")} value={profile?.location ?? "—"} />
      <Row label={t("sweep_profile.team.discipline")} value={disciplineLabel(profile?.primary_discipline)} mono />
      <div className="text-sm">
        <span className="text-muted-foreground">{t("sweep_profile.team.website")}:</span>
        <span className="ml-2 break-all">{profile?.website ? <a href={profile.website} target="_blank" rel="noopener" className="text-racing-red hover:underline">{profile.website}</a> : "—"}</span>
      </div>
      <div className="text-sm"><span className="text-muted-foreground">{t("sweep_profile.common.bio")}:</span><p className="mt-1">{profile?.bio ?? "—"}</p></div>
      <button onClick={() => setEditing(true)} className="mt-2 text-xs text-racing-red hover:underline">{t("sweep_profile.team.edit_info")}</button>
    </div>
  );
}

function LegalNameBlock({ profile }: { profile: any }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const saveName = useServerFn(setMyLegalName);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const locked = Boolean(profile?.first_name && profile?.last_name);

  const mutation = useMutation({
    mutationFn: async () => saveName({ data: { first_name: first, last_name: last } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-detail", user?.id] });
      toast.success(t("profile.legal_name_saved"));
    },
    onError: (e) => {
      const raw = e instanceof Error ? e.message : "";
      toast.error(raw.includes("NAME_LOCKED") ? t("profile.legal_name_locked") : t("profile.legal_name_invalid"));
    },
  });

  if (locked) {
    return (
      <div className="text-sm">
        <span className="text-muted-foreground">{t("profile.legal_name")}:</span>
        <span className="ml-2 font-bold">{profile.first_name} {profile.last_name}</span>
        <span className="ml-2 text-[11px] text-muted-foreground">({t("profile.cannot_be_changed")})</span>
      </div>
    );
  }

  return (
    <div className="border border-racing-yellow/40 bg-racing-yellow/5 p-3">
      <div className="label-mono text-[10px] text-racing-yellow">{t("profile.legal_name")}</div>
      <p className="mt-1 text-[11px] text-muted-foreground">{t("profile.legal_name_hint")}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          placeholder={t("profile.first_name")}
          className="w-full min-w-0 border border-border bg-background px-3 py-2 text-sm"
        />
        <input
          value={last}
          onChange={(e) => setLast(e.target.value)}
          placeholder={t("profile.last_name")}
          className="w-full min-w-0 border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || first.trim().length < 2 || last.trim().length < 2}
        className="mt-2 bg-racing-red px-4 py-2 text-xs font-bold uppercase text-white disabled:opacity-50"
      >
        {t("profile.legal_name_confirm")}
      </button>
    </div>
  );
}

function Row({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="min-w-0 text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <span className={`ml-2 break-words [overflow-wrap:anywhere] ${mono ? "font-mono" : ""} ${bold ? "font-bold" : ""}`}>{value}</span>
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
  const { t } = useTranslation();
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
          {allSelected ? t("sweep_profile.common.deselect_all") : t("sweep_profile.common.select_all")}
        </button>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("sweep_profile.common.filter")}
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
          {filtered.length === 0 && <div className="text-xs text-muted-foreground">{t("sweep_profile.common.no_matches")}</div>}
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
  const { t } = useTranslation();
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
          {t("sweep_profile.freelancer.motorsport_experience")} <span className="text-racing-red">({value.length}/{MAX_FREELANCER_EXPERIENCES})</span>
        </label>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t("sweep_profile.freelancer.experience_hint", { max: MAX_FREELANCER_EXPERIENCES })}
      </p>
      <div className="mt-2 space-y-2">
        {value.map((e, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 border border-border bg-background/40 p-2 md:grid-cols-[minmax(0,1fr)_140px_auto]">
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
              {t("sweep_profile.common.remove")}
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
        {value.length === 0 ? t("sweep_profile.freelancer.add_experience") : t("sweep_profile.freelancer.add_another_experience")}
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
  const { t } = useTranslation();
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
          {t("sweep_profile.freelancer.languages_spoken")} <span className="text-racing-red">({value.length}/{MAX_FREELANCER_LANGUAGES})</span>
        </label>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t("sweep_profile.freelancer.languages_hint")}
      </p>
      <div className="mt-2 space-y-2">
        {value.map((l, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 border border-border bg-background/40 p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
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
              {t("sweep_profile.common.remove")}
            </button>
            {l.code === "other" && (
              <input
                value={l.custom ?? ""}
                onChange={(ev) => update(i, { custom: ev.target.value })}
                placeholder={t("sweep_profile.freelancer.language_name_placeholder")}
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
        {value.length === 0 ? t("sweep_profile.freelancer.add_language") : t("sweep_profile.freelancer.add_another_language")}
      </button>
    </div>
  );
}


function SubRolesEditor({ group, value, onChange }: { group: string; value: FreelancerSubRole[]; onChange: (v: FreelancerSubRole[]) => void }) {
  const { t } = useTranslation();
  const tax = useTaxonomy();
  const options = tax.subRolesFor(group);
  if (!group) {
    return <div className="border border-border bg-card p-3 text-xs text-muted-foreground">{t("sweep_profile.freelancer.select_macro_role_first")}</div>;
  }
  const toggle = (sub: string) => {
    const exists = value.find((v) => v.sub_role === sub);
    onChange(exists ? value.filter((v) => v.sub_role !== sub) : [...value, { sub_role: sub, level: "intermediate" as SubRoleLevel }]);
  };
  const setLevel = (sub: string, level: SubRoleLevel) => onChange(value.map((v) => (v.sub_role === sub ? { ...v, level } : v)));
  return (
    <div>
      <label className="text-xs text-muted-foreground">{t("sweep_profile.freelancer.sub_roles_and_level")}</label>
      <div className="mt-1 max-h-72 space-y-1 overflow-auto border border-border bg-card p-2">
        {options.map((o) => {
          const sel = value.find((v) => v.sub_role === o.value);
          return (
            <div key={o.value} className="flex items-center justify-between gap-2 px-1 py-1">
              <label className="flex flex-1 items-center gap-2 text-sm">
                <input type="checkbox" checked={!!sel} onChange={() => toggle(o.value)} className="accent-racing-red" />
                <span>{o.label}</span>
              </label>
              {sel && (
                <select
                  value={sel.level}
                  onChange={(e) => setLevel(o.value, e.target.value as SubRoleLevel)}
                  className="border border-border bg-background px-2 py-1 font-mono text-[11px] uppercase"
                >
                  {SUB_ROLE_LEVELS.map((l) => (<option key={l} value={l}>{levelLabel(l)}</option>))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PitCodeBlock() {
  const { t } = useTranslation();
  const getCode = useServerFn(getMyPitCode);
  const { data } = useQuery({ queryKey: ["my-pit-code"], queryFn: () => getCode() });
  if (!data?.pit_code) return null;
  return (
    <div className="border border-sky-400/40 bg-sky-400/5 p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-sky-300">{t("pool.my_code")}</div>
      <div className="mt-1 flex items-center gap-3">
        <span className="font-mono text-lg font-black tracking-widest">{data.pit_code}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(data.pit_code as string);
            toast.success(t("pool.code_copied"));
          }}
          className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest hover:bg-secondary"
        >
          copy
        </button>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{t("pool.my_code_hint")}</div>
    </div>
  );
}
