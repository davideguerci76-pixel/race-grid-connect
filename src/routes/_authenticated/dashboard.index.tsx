import { confirmDialog } from "@/hooks/use-confirm";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { toast } from "sonner";
import { Calendar, CalendarRange, Coins, Star, Users, User, Briefcase, Flame, MapPin, Sparkles } from "lucide-react";
import { ActionRow, CardBody, CardHeader, CardShell, Fact, FactGrid, cardBtn } from "@/components/cards/primitives";
import { RelevanceScore } from "@/components/cards/match-signals";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getMyOpenSosCalls, acceptSosCall } from "@/lib/paddock.functions";
import { MarketHighlights } from "@/components/market-highlights";
import { MiniAvailabilityCard } from "@/components/mini-availability-card";
import { recordLegalAcceptance } from "@/lib/privacy.functions";
import { InstallAppCard } from "@/components/install-app-card";
import { ActivationCard } from "@/components/activation-card";
import { toastError } from "@/lib/errors";
import { usePitcallCreationDisabled } from "@/hooks/use-platform-flags";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["dashboard-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: p }, { data: balance }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, first_name, last_name, avatar_url, user_type, preferred_language, created_at, guided_demo_completed_at").eq("id", user!.id).maybeSingle(),
        supabase.rpc("my_token_balance"),
      ]);
      return p ? { ...p, token_balance: (balance as number | null) ?? 0 } : null;
    },
  });

  // Record proof of Terms / Privacy acceptance for accounts created via OAuth.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user?.id) return;
    if (window.sessionStorage.getItem("pendingLegalAccept") !== "1") return;
    window.sessionStorage.removeItem("pendingLegalAccept");
    void recordLegalAcceptance({ data: { source: "signup" } }).catch(() => undefined);
  }, [user?.id]);

  // Sync pending user_type saved before OAuth (Google sign-up doesn't pass metadata)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user?.id || !profile) return;
    const pending = window.sessionStorage.getItem("pendingUserType");
    const pendingAt = Number(window.sessionStorage.getItem("pendingUserTypeAt") ?? 0);
    if (!pending) return;
    if (!pendingAt || Date.now() - pendingAt > 10 * 60 * 1000) {
      window.sessionStorage.removeItem("pendingUserType");
      window.sessionStorage.removeItem("pendingUserTypeAt");
      return;
    }
    if (profile.created_at && Date.now() - new Date(profile.created_at).getTime() > 15 * 60 * 1000) {
      window.sessionStorage.removeItem("pendingUserType");
      window.sessionStorage.removeItem("pendingUserTypeAt");
      return;
    }
    if (pending !== "freelancer" && pending !== "team") {
      window.sessionStorage.removeItem("pendingUserType");
      window.sessionStorage.removeItem("pendingUserTypeAt");
      return;
    }
    if (pending === profile.user_type) {
      window.sessionStorage.removeItem("pendingUserType");
      window.sessionStorage.removeItem("pendingUserTypeAt");
      return;
    }
    (async () => {
      const { error } = await supabase.from("profiles").update({ user_type: pending }).eq("id", user.id);
      if (!error) {
        if (pending === "team") {
          await supabase
            .from("team_profiles")
            .upsert({ user_id: user.id, team_name: profile.display_name || "New team" }, { onConflict: "user_id", ignoreDuplicates: true });
        } else {
          await supabase
            .from("freelancer_profiles")
            .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
        }
        window.sessionStorage.removeItem("pendingUserType");
        window.sessionStorage.removeItem("pendingUserTypeAt");
        qc.invalidateQueries({ queryKey: ["dashboard-profile", user?.id] });
        qc.invalidateQueries({ queryKey: ["profile-summary", user?.id] });
        qc.invalidateQueries({ queryKey: ["profile-detail", user?.id] });
      }
    })();
  }, [user?.id, profile, qc]);

  const { data: matchesCount } = useQuery({
    queryKey: ["matches-count", user?.id],
    enabled: !!user && !!profile,
    queryFn: async () => {
      const col = profile!.user_type === "freelancer" ? "freelancer_id" : "team_id";
      const { count } = await supabase
        .from("engagements")
        .select("*", { count: "exact", head: true })
        .eq(col, user!.id);
      return count ?? 0;
    },
  });

  // "New matches" = items actually waiting for an action from the current user.
  // Team: matches with no confirmation request sent yet. Freelancer: pending confirmation requests received.
  const { data: activeMatchesCount } = useQuery({
    queryKey: ["pending-action-count", user?.id, profile?.user_type],
    enabled: !!user && !!profile,
    queryFn: async () => {
      if (profile!.user_type === "freelancer") {
        const { count } = await supabase
          .from("engagements")
          .select("*", { count: "exact", head: true })
          .eq("freelancer_id", user!.id)
          .eq("status", "proposed");
        return count ?? 0;
      }
      const [{ data: matches }, { data: engagements }] = await Promise.all([
        supabase.from("matches").select("request_id, freelancer_id").eq("stale", false).eq("team_id", user!.id),
        supabase.from("engagements").select("request_id, freelancer_id").eq("team_id", user!.id),
      ]);
      const handled = new Set((engagements ?? []).map((e) => `${e.request_id}:${e.freelancer_id}`));
      return (matches ?? []).filter((m) => !handled.has(`${m.request_id}:${m.freelancer_id}`)).length;
    },
  });





  const isFreelancer = profile?.user_type === "freelancer";
  const listSos = useServerFn(getMyOpenSosCalls);
  const acceptSos = useServerFn(acceptSosCall);
  const { data: sosCalls = [] } = useQuery({
    queryKey: ["open-sos", user?.id],
    enabled: !!user && isFreelancer,
    queryFn: () => listSos(),
    refetchInterval: 30_000,
  });
  const sosMut = useMutation({
    mutationFn: (sos_id: string) => acceptSos({ data: { sos_id } }),
    onSuccess: () => { toast.success(t("sweep_profile.dashboard.match_locked")); qc.invalidateQueries(); },
    onError: (e) => toastError(e, "sweep_profile.dashboard.sos_accept_failed"),
  });

  const isTeam = profile?.user_type === "team";
  const pitcallDisabled = usePitcallCreationDisabled() === true;
  // Role resolution is never assumed: until the profile lands, role-specific
  // cards render as a neutral placeholder instead of defaulting to Team UI.
  const roleReady = !!profile;
  // Loading is not zero: counters show a neutral dash until the server answers.
  const num = (v: number | undefined) => (v === undefined ? "—" : String(v));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      
      <div className="container-page py-12">
        <div className="label-mono">[DASHBOARD]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("dashboard.welcome", { name: (profile?.user_type === "freelancer" ? [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") : profile?.display_name) || "" })}</h1>

        <InstallAppCard />

        {isFreelancer && <ActivationCard />}

        {isTeam && !profile?.guided_demo_completed_at && (
          <Link
            to="/dashboard/try-demo"
            className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-racing-yellow bg-racing-yellow/10 p-5 transition-colors hover:bg-racing-yellow/20"
          >
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-racing-yellow">{t("trial.entry.label")}</div>
              <div className="mt-1 text-xl font-bold">{pitcallDisabled ? t("trial.entry.title") : t("trial.intro.title")}</div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("trial.entry.body")}</p>
            </div>
            <span className="inline-flex items-center gap-2 border border-racing-yellow px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-racing-yellow">
              <Sparkles className="size-4" /> {t("trial.entry.cta")} →
            </span>
          </Link>
        )}

        {(activeMatchesCount ?? 0) > 0 && (
          <Link to={isFreelancer ? "/dashboard/engagements" : "/dashboard/matches"} className="mt-6 flex items-center justify-between border border-racing-red bg-racing-red/10 p-4 transition-colors hover:bg-racing-red/20">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-racing-red">{isFreelancer ? t("dashboard.new_free_label") : t("dashboard.new_team_label")}</div>
              <div className="mt-1 text-xl font-bold">{isFreelancer ? t("dashboard.new_free_body", { count: activeMatchesCount }) : t("dashboard.new_team_body", { count: activeMatchesCount })}</div>
            </div>
            <span className="font-mono text-xs text-racing-red">{isFreelancer ? t("dashboard.new_free_pill", { count: activeMatchesCount }) : t("dashboard.new_team_pill", { count: activeMatchesCount })} →</span>
          </Link>
        )}


        {isFreelancer && (sosCalls as any[]).length > 0 && (
          <div className="mt-6 space-y-2">
            {(sosCalls as any[]).map((s) => (
              <CardShell key={s.sos_id} tone="danger">
                <CardHeader
                  icon={<Flame className="size-4" />}
                  tone="danger"
                  title="SOS CALL"
                  subtitle={s.request?.title ?? t("sweep_profile.dashboard.emergency_job")}
                  right={<RelevanceScore pct={Math.round(s.skills_score)} size="md" />}
                />
                <ActionRow>
                  <button
                    onClick={async () => { if (await confirmDialog(t("sweep_profile.dashboard.accept_sos_confirm"))) sosMut.mutate(s.sos_id); }}
                    disabled={sosMut.isPending}
                    className={cardBtn.primary}
                  >
                    {t("sweep_profile.dashboard.accept_sos")}
                  </button>
                  <Link to="/dashboard/sos/$sosId" params={{ sosId: s.sos_id }} className={cardBtn.secondary}>
                    {t("sos.view_sos_call")}
                  </Link>
                </ActionRow>
                <CardBody>
                  <FactGrid cols={3}>
                    <Fact icon={<Users />} label={t("cards.team")} value={s.team?.team_name ?? t("sweep_profile.dashboard.team_fallback")} />
                    <Fact icon={<Calendar />} label={t("cards.dates")} value={<span className="font-mono">{s.request?.start_date}</span>} />
                    {s.distance_km != null && <Fact icon={<MapPin />} label={t("cards.location")} value={`${Math.round(s.distance_km)} km`} />}
                  </FactGrid>
                </CardBody>
              </CardShell>
            ))}
          </div>
        )}

        {isFreelancer && (
          <div className="mt-8">
            <MiniAvailabilityCard
              fallback={<DashCard to="/dashboard/calendar" icon={Calendar} label={t("dashboard.my_availability_label")} value={t("dashboard.manage_availability_calendar")} />}
            />
          </div>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-5">
          <DashCard to="/dashboard/profile" icon={User} label={t("nav.profile")} value="→" />
          {!roleReady && <DashCardSkeleton />}
          {isTeam && (
            <>
              <DashCard to="/dashboard/requests" icon={Briefcase} label={t("requests.title")} value={t("requests.new")} />
              <DashCard to="/dashboard/team-calendar" icon={Calendar} label={t("pcal.team_card")} value="→" />
            </>
          )}
          <DashCard to="/dashboard/calendars" icon={CalendarRange} label={t("sweep_profile.dashboard.manage_calendars")} value="→" />
          {!roleReady ? (
            <DashCardSkeleton />
          ) : isFreelancer ? (
            <DashCard
              to="/dashboard/matches"
              icon={Users}
              label={t("dashboard.my_matches")}
              value={
                activeMatchesCount === undefined
                  ? "—"
                  : activeMatchesCount === 0
                    ? ""
                    : activeMatchesCount === 1
                      ? t("dashboard.active_match_one")
                      : t("dashboard.active_match_other", { count: activeMatchesCount })
              }
            />
          ) : (
            <DashCard to="/dashboard/matches" icon={Users} label={t("nav.matches")} value={num(activeMatchesCount)} />
          )}
          <DashCard to="/dashboard/tokens" icon={Coins} label={t("dashboard.tokens_balance")} value={profile ? String(profile.token_balance) : "—"} />
          <DashCard to="/dashboard/engagements" icon={Star} label={t("nav.engagements")} value={num(matchesCount)} />
          {isTeam && <DashCard to="/dashboard/pool" icon={Users} label={t("pool.nav")} value="→" />}
          {isTeam && profile?.guided_demo_completed_at && <DashCard to="/dashboard/try-demo" icon={Sparkles} label={t("trial.entry.replay_label")} value={t("trial.entry.replay_cta")} />}
        </div>

        <MarketHighlights compact />
      </div>
      <SiteFooter />
    </div>
  );
}

function DashCardSkeleton() {
  return (
    <div className="border border-border bg-card p-6" aria-hidden>
      <div className="size-8 animate-pulse rounded bg-muted" />
      <div className="mt-4 h-3 w-24 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-6 w-16 animate-pulse rounded bg-muted" />
    </div>
  );
}

function DashCard({ to, icon: Icon, label, value }: { to: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; value: string }) {
  return (
    <Link to={to} className="group block border border-border bg-card p-6 transition-colors hover:border-racing-red">
      <div className="flex items-center justify-between">
        <Icon className="size-8 text-racing-red" strokeWidth={1.5} />
      </div>
      <div className="label-mono mt-4">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </Link>
  );
}