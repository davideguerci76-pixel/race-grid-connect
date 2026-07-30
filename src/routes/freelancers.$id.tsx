import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AnonymousReviewsSection, ProfileRatingBadge } from "@/components/anonymous-reviews";
import { disciplineLabel, educationLabel, skillLabel } from "@/lib/paddock";
import { levelLabel, parseSubRoles, roleGroupLabel, subRoleLabel } from "@/lib/roles";

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
      const { data: availability } = await supabase.from("availability").select("day").eq("freelancer_id", id).gte("day", new Date().toISOString().slice(0, 10)).limit(60);
      return { fp, availability: availability ?? [] };
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

  const { fp, availability } = data;
  const isOwner = user.id === id;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="border border-border bg-card p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">{fp.headline || roleGroupLabel(fp.role_group)}</h1>
              <div className="mt-1 text-sm text-muted-foreground">
                {roleGroupLabel(fp.role_group)}{parseSubRoles(fp.sub_roles).length ? ` · ${parseSubRoles(fp.sub_roles).map((sr) => `${subRoleLabel(sr.sub_role)} (${levelLabel(sr.level)})`).join(", ")}` : ""} · {fp.location ?? "—"}
              </div>
              {fp.education && (
                <div className="mt-1 font-mono text-[11px] uppercase tracking-widest text-racing-yellow">
                  {educationLabel(fp.education)}
                </div>
              )}
              <div className="mt-2"><ProfileRatingBadge userId={id} variant="wrench" isOwner={isOwner} /></div>
              {(() => {
                const ts = (fp as any).calendar_last_updated_at;
                if (!ts) return null;
                const d = new Date(ts);
                const days = Math.floor((Date.now() - d.getTime()) / 86400000);
                const tone = days < 30 ? "text-[#16a34a]" : days < 90 ? "text-racing-yellow" : "text-racing-red";
                return (
                  <div className={`mt-2 font-mono text-[11px] uppercase tracking-widest ${tone}`}>
                    Calendar confirmed {days}d ago · {d.toLocaleDateString()}
                  </div>
                );
              })()}
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

          <AnonymousReviewsSection targetUserId={id} variant="wrench" isOwner={isOwner} />
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
