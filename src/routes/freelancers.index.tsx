import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { initialsFor } from "@/lib/paddock";

export const Route = createFileRoute("/freelancers")({
  component: FreelancersIndex,
});

function FreelancersIndex() {
  const { t } = useTranslation();
  const { data: rows = [] } = useQuery({
    queryKey: ["public-freelancers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, freelancer_profiles!inner(role, disciplines, day_rate, currency, location, headline, travels)")
        .eq("user_type", "freelancer")
        .limit(48);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="label-mono">[TALENT]</div>
        <h1 className="text-5xl font-black uppercase italic tracking-tighter">{t("freelancers.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("freelancers.sub", { count: rows.length })}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((f) => {
            const p = Array.isArray(f.freelancer_profiles) ? f.freelancer_profiles[0] : f.freelancer_profiles;
            return (
              <Link key={f.id} to="/freelancers/$id" params={{ id: f.id }} className="group border border-border bg-card p-5 transition-colors hover:border-racing-red">
                <div className="flex items-start gap-3">
                  <div className="flex size-12 items-center justify-center bg-racing-red font-mono text-sm font-bold text-white">
                    {initialsFor(f.display_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{f.display_name}</div>
                    <div className="text-xs text-muted-foreground">{p ? t(`role.${p.role}`) : ""}</div>
                  </div>
                </div>
                {p?.headline && <div className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.headline}</div>}
                <div className="mt-4 flex flex-wrap gap-1">
                  {p?.disciplines?.map((d: string) => (
                    <span key={d} className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t(`discipline.${d}`)}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between font-mono text-xs">
                  <span className="text-muted-foreground">{p?.location ?? "—"}</span>
                  {p?.day_rate ? <span className="font-bold text-racing-yellow">{p.currency} {p.day_rate}{t("common.per_day")}</span> : null}
                </div>
              </Link>
            );
          })}
        </div>
        {rows.length === 0 && <div className="mt-8 border border-border bg-card p-12 text-center text-sm text-muted-foreground">No freelancers yet.</div>}
      </div>
      <SiteFooter />
    </div>
  );
}
