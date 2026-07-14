import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RatingStars } from "@/components/rating-stars";
import { disciplineLabel, roleLabel, skillLabel } from "@/lib/paddock";

export const Route = createFileRoute("/freelancers/$id")({
  component: FreelancerProfile,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center">Freelancer not found</div>
  ),
});

function FreelancerProfile() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["freelancer-detail", id],
    enabled: !!user,
    queryFn: async () => {
      const { data: fp } = await supabase.from("freelancer_profiles").select("*").eq("user_id", id).maybeSingle();
      if (!fp) throw notFound();
      const [{ data: availability }, { data: ratings }] = await Promise.all([
        supabase.from("availability").select("day").eq("freelancer_id", id).gte("day", new Date().toISOString().slice(0, 10)).limit(60),
        supabase.from("ratings").select("stars, comment, created_at").eq("to_user_id", id).order("created_at", { ascending: false }).limit(20),
      ]);
      const rows = ((ratings ?? []) as unknown) as Array<{ stars: number; created_at: string; comment?: string | null }>;
      const avg = rows.length ? rows.reduce((a, r) => a + r.stars, 0) / rows.length : 0;
      return { fp, availability: availability ?? [], ratings: rows, avg };
    },
  });

  if (authLoading) return <div className="flex min-h-screen items-center justify-center">{t("common.loading")}</div>;
  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="container-page py-16 text-center">
          <div className="label-mono">[LOCKED]</div>
          <h1 className="mt-2 text-3xl font-black uppercase italic tracking-tighter">Sign in to view freelancer</h1>
          <Link to="/auth" className="mt-6 inline-block bg-racing-red px-6 py-3 text-xs font-bold uppercase tracking-widest text-white">Sign in / Register</Link>
        </div>
        <SiteFooter />
      </div>
    );
  }
  if (isLoading || !data) return <div className="flex min-h-screen items-center justify-center">{t("common.loading")}</div>;

  const { fp, availability, ratings, avg } = data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="border border-border bg-card p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">{fp.headline || roleLabel(fp.role)}</h1>
              <div className="mt-1 text-sm text-muted-foreground">
                {roleLabel(fp.role)} · {fp.location ?? "—"}
              </div>
              {ratings.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <RatingStars value={Math.round(avg)} readOnly size={16} />
                  <span className="font-mono text-xs text-muted-foreground">{avg.toFixed(1)} ({ratings.length})</span>
                </div>
              )}
            </div>
            {fp.day_rate && (
              <div className="text-right">
                <div className="label-mono">Day rate</div>
                <div className="mt-1 font-mono text-2xl font-black text-racing-yellow">{fp.currency} {fp.day_rate}</div>
              </div>
            )}
          </div>
          {fp.bio && <p className="mt-3 text-sm text-muted-foreground">{fp.bio}</p>}
          <div className="mt-6 flex flex-wrap gap-2">
            {fp.disciplines?.map((d: string) => (
              <span key={d} className="border border-racing-red/40 bg-racing-red/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-racing-red">
                {disciplineLabel(d)}
              </span>
            ))}
          </div>
          {fp.skills && fp.skills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {fp.skills.map((s: string) => (
                <span key={s} className="border border-border bg-secondary/40 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  {skillLabel(s)}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="border border-border bg-card p-6">
            <div className="label-mono mb-3">Availability (next 60 days)</div>
            <div className="grid grid-cols-7 gap-1">
              {availability.slice(0, 42).map((a) => (
                <div key={a.day} className="border border-racing-red/40 bg-racing-red/10 px-1 py-2 text-center font-mono text-[10px] text-racing-red">
                  {a.day.slice(5)}
                </div>
              ))}
              {availability.length === 0 && <div className="col-span-7 text-sm text-muted-foreground">No availability posted.</div>}
            </div>
          </div>

          <div className="border border-border bg-card p-6">
            <div className="label-mono mb-3">Ratings</div>
            {ratings.length === 0 ? (
              <div className="text-sm text-muted-foreground">{t("rating.no_ratings")}</div>
            ) : (
              <ul className="space-y-4">
                {ratings.map((r, i) => (
                  <li key={i} className="border-b border-border pb-3 last:border-0">
                    <RatingStars value={r.stars} readOnly size={14} />
                    {r.comment && <div className="mt-2 text-sm text-muted-foreground">{r.comment}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
