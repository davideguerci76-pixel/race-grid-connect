import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { toast } from "sonner";
import { Calendar, CalendarRange, Coins, Star, Users, User, Briefcase, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getMyOpenSosCalls, acceptSosCall } from "@/lib/paddock.functions";
import { MarketHighlights } from "@/components/market-highlights";

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
        supabase.from("profiles").select("id, display_name, first_name, last_name, avatar_url, user_type, preferred_language, created_at").eq("id", user!.id).maybeSingle(),
        supabase.rpc("my_token_balance"),
      ]);
      return p ? { ...p, token_balance: (balance as number | null) ?? 0 } : null;
    },
  });

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

  const { data: matchesCount = 0 } = useQuery({
    queryKey: ["matches-count", user?.id],
    enabled: !!user && !!profile,
    queryFn: async () => {
      const col = profile!.user_type === "freelancer" ? "freelancer_id" : "team_id";
      const { count } = await supabase
        .from("match_history" as never)
        .select("*", { count: "exact", head: true })
        .eq(col, user!.id);
      return count ?? 0;
    },
  });

  const { data: activeMatchesCount = 0 } = useQuery({
    queryKey: ["active-matches-count", user?.id],
    enabled: !!user && !!profile,
    queryFn: async () => {
      const col = profile!.user_type === "freelancer" ? "freelancer_id" : "team_id";
      const { count } = await supabase.from("matches").select("*", { count: "exact", head: true }).eq(col, user!.id);
      return count ?? 0;
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
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_profile.dashboard.sos_accept_failed")),
  });

  const isTeam = profile?.user_type === "team";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      
      <div className="container-page py-12">
        <div className="label-mono">[DASHBOARD]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("dashboard.welcome", { name: (profile?.user_type === "freelancer" ? [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") : profile?.display_name) || "" })}</h1>

        {activeMatchesCount > 0 && (
          <Link to="/dashboard/matches" className="mt-6 flex items-center justify-between border border-racing-red bg-racing-red/10 p-4 transition-colors hover:bg-racing-red/20">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-racing-red">[NEW MATCHES]</div>
              <div className="mt-1 text-xl font-bold">{t("matches.counts_banner", { count: activeMatchesCount, who: profile?.user_type === "freelancer" ? t("nav.teams") : t("nav.freelancers") })}</div>
            </div>
            <span className="font-mono text-xs text-racing-red">{t("dashboard.new_matches_pill", { count: activeMatchesCount })} →</span>
          </Link>
        )}

        {isFreelancer && (sosCalls as any[]).length > 0 && (
          <div className="mt-6 space-y-2">
            {(sosCalls as any[]).map((s) => (
              <div key={s.sos_id} className="flex flex-wrap items-start justify-between gap-3 border-2 border-racing-red bg-racing-red/10 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-racing-red">
                    <Flame className="size-4" /> [SOS CALL — {Math.round(s.skills_score)}% affinity]
                  </div>
                  <div className="mt-1 text-lg font-bold">{s.request?.title ?? t("sweep_profile.dashboard.emergency_job")}</div>
                  <div className="font-mono text-[11px] uppercase text-muted-foreground">
                    {s.team?.team_name ?? t("sweep_profile.dashboard.team_fallback")} · {s.request?.start_date}
                    {s.distance_km != null ? ` · ${Math.round(s.distance_km)} km` : ""}
                  </div>
                </div>
                <button
                  onClick={() => { if (confirm(t("sweep_profile.dashboard.accept_sos_confirm"))) sosMut.mutate(s.sos_id); }}
                  disabled={sosMut.isPending}
                  className="bg-racing-red px-4 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
                >
                  {t("sweep_profile.dashboard.accept_sos")}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-5">
          <DashCard to="/dashboard/profile" icon={User} label={t("nav.profile")} value="→" />
          {isTeam ? (
            <DashCard to="/dashboard/requests" icon={Briefcase} label={t("requests.title")} value={t("requests.new")} />
          ) : (
            <DashCard to="/dashboard/calendar" icon={Calendar} label={t("nav.calendar")} value={t("dashboard.manage_calendar")} />
          )}
          <DashCard to="/dashboard/calendars" icon={CalendarRange} label={t("sweep_profile.dashboard.manage_calendars")} value="→" />
          <DashCard to="/dashboard/matches" icon={Users} label={t("nav.matches")} value={String(matchesCount)} />
          <DashCard to="/dashboard/tokens" icon={Coins} label={t("dashboard.tokens_balance")} value={String(profile?.token_balance ?? 0)} />
          <DashCard to="/dashboard/engagements" icon={Star} label={t("nav.engagements")} value="→" />
        </div>

        <MarketHighlights compact />
      </div>
      <SiteFooter />
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