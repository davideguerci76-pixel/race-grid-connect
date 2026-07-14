import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { initialsFor, disciplineLabel, roleLabel, skillLabel } from "@/lib/paddock";

export const Route = createFileRoute("/teams/$id")({
  component: TeamProfile,
  notFoundComponent: () => (<div className="flex min-h-screen items-center justify-center">Team not found</div>),
});

function TeamProfile() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["team-detail", id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: tp }, { data: requests }] = await Promise.all([
        supabase.from("team_profiles").select("*").eq("user_id", id).maybeSingle(),
        supabase.from("requests").select("*").eq("team_id", id).eq("is_active", true).order("start_date"),
      ]);
      return { tp, requests: requests ?? [] };
    },
  });

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center">{t("common.loading")}</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="container-page py-16 text-center">
          <div className="label-mono">[LOCKED]</div>
          <h1 className="mt-2 text-3xl font-black uppercase italic tracking-tighter">Sign in to view team</h1>
          <p className="mt-2 text-sm text-muted-foreground">Team profiles are visible to authenticated members only.</p>
          <Link to="/auth" className="mt-6 inline-block bg-racing-red px-6 py-3 text-xs font-bold uppercase tracking-widest text-white">Sign in / Register</Link>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">{t("common.loading")}</div>;
  if (!data?.tp) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="container-page py-16 text-center">
          <div className="label-mono">[NOT FOUND]</div>
          <h1 className="mt-2 text-3xl font-black uppercase italic tracking-tighter">Team not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This team profile is not available yet.</p>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const { tp, requests } = data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="border border-border bg-card p-8">
          <div className="flex gap-4">
            <div className="flex size-20 items-center justify-center bg-racing-yellow font-mono text-xl font-black text-carbon">
              {tp.initials ?? initialsFor(tp.team_name)}
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">{tp.team_name}</h1>
              <div className="mt-1 text-sm text-muted-foreground">{tp.team_type ?? "Racing team"} · {tp.location ?? "—"}</div>
              {tp.primary_discipline && (
                <span className="mt-2 inline-block border border-racing-red/40 bg-racing-red/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-racing-red">
                  {disciplineLabel(tp.primary_discipline)}
                </span>
              )}
              {tp.website && (
                <div className="mt-2 text-xs"><a href={tp.website} target="_blank" rel="noopener" className="text-racing-red hover:underline">{tp.website}</a></div>
              )}
            </div>
          </div>
          {tp.bio && <p className="mt-6 text-sm text-muted-foreground">{tp.bio}</p>}
        </div>

        <div className="mt-8">
          <div className="label-mono mb-3">Active requests</div>
          {requests.length === 0 ? (
            <div className="border border-border bg-card p-8 text-center text-sm text-muted-foreground">No active requests.</div>
          ) : (
            <div className="grid gap-3">
              {requests.map((r) => (
                <div key={r.id} className="border border-border bg-card p-4">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <span className="border border-racing-red/40 bg-racing-red/10 px-2 py-0.5 font-mono text-[10px] uppercase text-racing-red">{disciplineLabel(r.discipline)}</span>
                    <span className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{roleLabel(r.role)}</span>
                  </div>
                  <div className="font-bold">{r.title}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.start_date} → {r.end_date}{r.circuit ? ` · ${r.circuit}` : ""}</div>
                  {r.skills && r.skills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.skills.map((s: string) => (
                        <span key={s} className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{skillLabel(s)}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
