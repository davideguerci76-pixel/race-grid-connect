import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { initialsFor } from "@/lib/paddock";

export const Route = createFileRoute("/teams/$id")({
  component: TeamProfile,
  notFoundComponent: () => (<div className="flex min-h-screen items-center justify-center">Team not found</div>),
});

function TeamProfile() {
  const { id } = Route.useParams();
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["team", id],
    queryFn: async () => {
      const [{ data: profile }, { data: requests }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url, user_type, team_profiles(*)").eq("id", id).maybeSingle(),
        supabase.from("requests").select("*").eq("team_id", id).eq("is_active", true).order("start_date"),
      ]);
      return { profile, requests: requests ?? [] };
    },
  });

  if (isLoading || !data?.profile) return <div className="flex min-h-screen items-center justify-center">{t("common.loading")}</div>;
  const { profile, requests } = data;
  const tp = Array.isArray(profile.team_profiles) ? profile.team_profiles[0] : profile.team_profiles;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="border border-border bg-card p-8">
          <div className="flex gap-4">
            <div className="flex size-20 items-center justify-center bg-racing-yellow font-mono text-xl font-black text-carbon">
              {tp?.initials ?? initialsFor(tp?.team_name ?? profile.display_name)}
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">{tp?.team_name ?? profile.display_name}</h1>
              <div className="mt-1 text-sm text-muted-foreground">{tp?.team_type ?? "Racing team"} · {tp?.location ?? "—"}</div>
              {tp?.primary_discipline && (
                <span className="mt-2 inline-block border border-racing-red/40 bg-racing-red/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-racing-red">
                  {t(`discipline.${tp.primary_discipline}`)}
                </span>
              )}
            </div>
          </div>
          {tp?.bio && <p className="mt-6 text-sm text-muted-foreground">{tp.bio}</p>}
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
                    <span className="border border-racing-red/40 bg-racing-red/10 px-2 py-0.5 font-mono text-[10px] uppercase text-racing-red">{t(`discipline.${r.discipline}`)}</span>
                    <span className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{t(`role.${r.role}`)}</span>
                  </div>
                  <div className="font-bold">{r.title}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.start_date} → {r.end_date}{r.circuit ? ` · ${r.circuit}` : ""}</div>
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
