import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AnonymousReviewsSection, ProfileRatingBadge } from "@/components/anonymous-reviews";
import { disciplineLabel, educationLabel, skillLabel } from "@/lib/paddock";
import { levelLabel, parseSubRoles, roleGroupLabel, subRoleLabel } from "@/lib/roles";
import { BackButton } from "@/components/back-button";
import { useDateFormat } from "@/lib/date-locale";
import { getFreelancerProfile } from "@/lib/freelancer-profile.functions";

export const Route = createFileRoute("/freelancers/$id")({
  component: FreelancerProfile,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center">Freelancer not found</div>
  ),
});

function FreelancerProfile() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const { formatDate } = useDateFormat();
  const { user, loading: authLoading } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["freelancer-detail", id],
    enabled: !!user,
    queryFn: async () => {
      const result = await getFreelancerProfile({ data: { user_id: id } });
      if (!result.profile) throw notFound();
      return { fp: result.profile, availability: result.availability };
    },
  });

  if (authLoading) return <div className="flex min-h-screen items-center justify-center">{t("common.loading")}</div>;
  if (!user) return <UnauthorizedFreelancerProfile />;
  if (isLoading || !data) return <div className="flex min-h-screen items-center justify-center">{t("common.loading")}</div>;

  const { fp, availability } = data;
  const isOwner = user.id === id;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <CardShell tone="neutral">
          <CardHeader icon={<User className="size-4" />} tone="info" title={t("cards.freelancer")} subtitle={t("cards.profile")} />
          <CardBody>
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">{fp.headline || roleGroupLabel(fp.role_group)}</h1>
              <div className="mt-2"><ProfileRatingBadge userId={id} variant="wrench" isOwner={isOwner} /></div>
            </div>
            <FactGrid cols={3}>
              <Fact
                icon={<Flag />}
                label={t("cards.role")}
                value={roleGroupLabel(fp.role_group)}
                sub={parseSubRoles(fp.sub_roles).length ? parseSubRoles(fp.sub_roles).map((sr) => `${subRoleLabel(sr.sub_role)} (${levelLabel(sr.level)})`).join(", ") : undefined}
              />
              <Fact icon={<MapPin />} label={t("cards.location")} value={fp.location ?? "—"} />
              {fp.education && <Fact icon={<GraduationCap />} label={t("reveal.education")} value={<span className="text-racing-yellow">{educationLabel(fp.education)}</span>} />}
              {(() => {
                const ts = (fp as any).calendar_last_confirmed_at ?? (fp as any).calendar_last_updated_at;
                if (!ts) return null;
                const d = new Date(ts);
                const days = Math.floor((Date.now() - d.getTime()) / 86400000);
                const tone = days < 45 ? "text-[#16a34a]" : days < 90 ? "text-racing-yellow" : "text-muted-foreground";
                return <Fact icon={<CalendarCheck />} label={t("cards.calendar")} value={<span className={tone}>Calendar confirmed {days}d ago</span>} sub={formatDate(d)} />;
              })()}
            </FactGrid>
            {fp.bio && <p className="text-sm text-muted-foreground">{fp.bio}</p>}
            {fp.disciplines && fp.disciplines.length > 0 && (
              <Section title={t("mcard.disciplines")}>
                <Chips>{fp.disciplines.map((d: string) => <Chip key={d} tone="hard">{disciplineLabel(d)}</Chip>)}</Chips>
              </Section>
            )}
            {fp.skills && fp.skills.length > 0 && (
              <Section title={t("mcard.skills")}>
                <Chips>{fp.skills.map((s: string) => <Chip key={s}>{skillLabel(s)}</Chip>)}</Chips>
              </Section>
            )}
          </CardBody>
        </CardShell>

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

/**
 * Signed-out visitor view. Freelancer profiles are not public on PITCALL:
 * no profile data (not even anonymized) is fetched or rendered for anon
 * visitors — only a clean sign-in prompt.
 */
function UnauthorizedFreelancerProfile() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page py-16">
        <div className="border border-border bg-card p-8 text-center">
          <div className="label-mono">[RESTRICTED]</div>
          <h1 className="mt-2 text-3xl font-black uppercase italic tracking-tighter">
            Sign in to view this profile
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Freelancer profiles are visible to PITCALL members only.
          </p>
          <Link to="/auth" className="mt-6 inline-block bg-racing-red px-6 py-3 text-xs font-bold uppercase tracking-widest text-white">
            Sign in / Register
          </Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
