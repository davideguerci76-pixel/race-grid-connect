import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { initialsFor } from "@/lib/paddock";

export const Route = createFileRoute("/teams")({
  component: TeamsIndex,
});

function TeamsIndex() {
  const { t } = useTranslation();
  const { data: rows = [] } = useQuery({
    queryKey: ["public-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, team_profiles!inner(team_name, initials, team_type, location, primary_discipline, bio, size)")
        .eq("user_type", "team")
        .limit(48);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="label-mono">[TEAMS]</div>
        <h1 className="text-5xl font-black uppercase italic tracking-tighter">{t("teams.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("teams.sub")}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const p = Array.isArray(r.team_profiles) ? r.team_profiles[0] : r.team_profiles;
            return (
              <Link key={r.id} to="/teams/$id" params={{ id: r.id }} className="group border border-border bg-card p-5 transition-colors hover:border-racing-red">
                <div className="flex items-start gap-3">
                  <div className="flex size-12 items-center justify-center bg-racing-yellow font-mono text-sm font-black text-carbon">
                    {p?.initials ?? initialsFor(p?.team_name ?? r.display_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{p?.team_name ?? r.display_name}</div>
                    <div className="text-xs text-muted-foreground">{p?.team_type ?? "Racing team"}</div>
                  </div>
                </div>
                {p?.bio && <div className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.bio}</div>}
                <div className="mt-3 flex items-center justify-between font-mono text-xs">
                  <span className="text-muted-foreground">{p?.location ?? "—"}</span>
                  {p?.primary_discipline && (
                    <span className="border border-racing-red/40 bg-racing-red/10 px-2 py-0.5 text-[10px] uppercase text-racing-red">
                      {t(`discipline.${p.primary_discipline}`)}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
        {rows.length === 0 && <div className="mt-8 border border-border bg-card p-12 text-center text-sm text-muted-foreground">No teams yet.</div>}
      </div>
      <SiteFooter />
    </div>
  );
}
