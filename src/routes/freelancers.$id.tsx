import { createFileRoute, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RatingStars } from "@/components/rating-stars";
import { initialsFor } from "@/lib/paddock";

export const Route = createFileRoute("/freelancers/$id")({
  component: FreelancerProfile,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center">Freelancer not found</div>
  ),
});

function FreelancerProfile() {
  const { id } = Route.useParams();
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["freelancer", id],
    queryFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("id, display_name, avatar_url, user_type, freelancer_profiles(*)").eq("id", id).maybeSingle();
      if (!profile) throw notFound();
      const { data: sessionData } = await supabase.auth.getSession();
      const isAuthed = !!sessionData.session;
      const ratingCols = isAuthed ? "stars, comment, created_at" : "stars, created_at";
      const [{ data: availability }, { data: ratings }] = await Promise.all([
        supabase.from("availability").select("day").eq("freelancer_id", id).gte("day", new Date().toISOString().slice(0, 10)).limit(60),
        supabase.from("ratings").select(ratingCols).eq("to_user_id", id).order("created_at", { ascending: false }).limit(20),
      ]);
      const rows = ((ratings ?? []) as unknown) as Array<{ stars: number; created_at: string; comment?: string | null }>;
      const avg = rows.length ? rows.reduce((a, r) => a + r.stars, 0) / rows.length : 0;
      return { profile, availability: availability ?? [], ratings: rows, avg };
    },
  });

  if (isLoading || !data) return <div className="flex min-h-screen items-center justify-center">{t("common.loading")}</div>;

  const { profile, availability, ratings, avg } = data;
  const fp = Array.isArray(profile.freelancer_profiles) ? profile.freelancer_profiles[0] : profile.freelancer_profiles;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="border border-border bg-card p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-4">
              <div className="flex size-20 items-center justify-center bg-racing-red font-mono text-xl font-black text-white">
                {initialsFor(profile.display_name)}
              </div>
              <div>
                <h1 className="text-3xl font-black uppercase italic tracking-tighter">{profile.display_name}</h1>
                <div className="mt-1 text-sm text-muted-foreground">
                  {fp && t(`role.${fp.role}`)} · {fp?.location ?? "—"}
                </div>
                {ratings.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <RatingStars value={Math.round(avg)} readOnly size={16} />
                    <span className="font-mono text-xs text-muted-foreground">{avg.toFixed(1)} ({ratings.length})</span>
                  </div>
                )}
              </div>
            </div>
            {fp?.day_rate && (
              <div className="text-right">
                <div className="label-mono">Day rate</div>
                <div className="mt-1 font-mono text-2xl font-black text-racing-yellow">{fp.currency} {fp.day_rate}</div>
              </div>
            )}
          </div>
          {fp?.headline && <p className="mt-6 text-lg">{fp.headline}</p>}
          {fp?.bio && <p className="mt-3 text-sm text-muted-foreground">{fp.bio}</p>}
          <div className="mt-6 flex flex-wrap gap-2">
            {fp?.disciplines?.map((d: string) => (
              <span key={d} className="border border-racing-red/40 bg-racing-red/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-racing-red">
                {t(`discipline.${d}`)}
              </span>
            ))}
          </div>
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
