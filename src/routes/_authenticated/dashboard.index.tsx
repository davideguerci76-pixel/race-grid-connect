import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Coins, Star, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: p }, { data: balance }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url, user_type, preferred_language").eq("id", user!.id).maybeSingle(),
        supabase.rpc("my_token_balance"),
      ]);
      return p ? { ...p, token_balance: (balance as number | null) ?? 0 } : null;
    },
  });
  const { data: matchesCount = 0 } = useQuery({
    queryKey: ["matches-count", user?.id],
    enabled: !!user && !!profile,
    queryFn: async () => {
      const col = profile!.user_type === "freelancer" ? "freelancer_id" : "team_id";
      const rev = profile!.user_type === "freelancer" ? "revealed_by_freelancer" : "revealed_by_team";
      const { count } = await supabase.from("matches").select("*", { count: "exact", head: true }).eq(col, user!.id).eq(rev, false);
      return count ?? 0;
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="label-mono">[DASHBOARD]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("dashboard.welcome", { name: profile?.display_name ?? "" })}</h1>

        {matchesCount > 0 && (
          <Link to="/dashboard/matches" className="mt-6 flex items-center justify-between border border-racing-red bg-racing-red/10 p-4 transition-colors hover:bg-racing-red/20">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-racing-red">[NEW MATCHES]</div>
              <div className="mt-1 text-xl font-bold">{t("matches.counts_banner", { count: matchesCount, who: profile?.user_type === "freelancer" ? t("nav.teams") : t("nav.freelancers") })}</div>
            </div>
            <span className="font-mono text-xs text-racing-red">{t("dashboard.new_matches_pill", { count: matchesCount })} →</span>
          </Link>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <DashCard to="/dashboard/calendar" icon={Calendar} label={t("nav.calendar")} value={profile?.user_type === "team" ? t("dashboard.post_request") : t("dashboard.manage_calendar")} />
          <DashCard to="/dashboard/matches" icon={Users} label={t("nav.matches")} value={String(matchesCount)} />
          <DashCard to="/dashboard/tokens" icon={Coins} label={t("dashboard.tokens_balance")} value={String(profile?.token_balance ?? 0)} />
          <DashCard to="/dashboard/engagements" icon={Star} label={t("nav.engagements")} value="→" />
        </div>
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