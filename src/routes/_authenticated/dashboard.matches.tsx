import { confirmDialog } from "@/hooks/use-confirm";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getMyMatches, revealMatch, getMyRequests, getMyEngagements } from "@/lib/paddock.functions";
import { getPlatformSettings } from "@/lib/admin.functions";
import { BackButton } from "@/components/back-button";
import { FreelancerMatchCard } from "@/components/cards/freelancer-match-card";
import { TeamRequestHistoryCard } from "@/components/cards/team-request-history-card";

import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/dashboard/matches")({
  component: MatchesPage,
});



function MatchesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const getMatches = useServerFn(getMyMatches);
  const reveal = useServerFn(revealMatch);
  const fetchSettings = useServerFn(getPlatformSettings);
  const { data: revealSettings = [] } = useQuery({ queryKey: ["platform-settings"], queryFn: () => fetchSettings() });
  const revealCost = Number((revealSettings as Array<{ key: string; value_num: number }>).find((x) => x.key === "cost_reveal_match")?.value_num ?? 1);
  const revealCta = revealCost > 0 ? t("matches.reveal_1_token", { count: revealCost }) : t("matches.reveal_cta_free");
  const getRequests = useServerFn(getMyRequests);
  const getEngs = useServerFn(getMyEngagements);

  const { data } = useQuery({ queryKey: ["matches"], queryFn: () => getMatches() });
  const matches = data?.matches ?? [];
  const isFreelancer = data?.userType === "freelancer";
  const isTeam = data?.userType === "team";

  const { data: teamRequests = [] } = useQuery({
    queryKey: ["my-requests-summary"],
    enabled: isTeam,
    queryFn: () => getRequests(),
  });
  const { data: teamEngs = [] } = useQuery({
    queryKey: ["engagements"],
    enabled: isTeam,
    queryFn: () => getEngs(),
  });


  const mut = useMutation({
    mutationFn: (id: string) => reveal({ data: { match_id: id } }),
    onSuccess: () => { toast.success(t("sweep_engage.matches.revealed_toast")); qc.invalidateQueries(); },
    onError: (e) => toastError(e, "matches.insufficient_tokens"),
  });


  // Never assume a role while it is still loading: the freelancer view below
  // would otherwise flash for teams on a cold load.
  if (!data) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="container-page py-12">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-10 w-64 animate-pulse rounded bg-muted" />
          <div className="mt-8 h-40 w-full animate-pulse rounded bg-muted/60" />
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (isTeam) {

    const confirmedByReq = new Map<string, any>();
    for (const e of teamEngs as any[]) {
      if (e.status === "confirmed" || e.status === "completed") confirmedByReq.set(e.request_id ?? e.request?.id, e);
    }
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
        <div className="container-page py-12">
          <div className="label-mono">[MATCHES]</div>
          <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("matches.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("sweep_engage.matches.team_history_subtitle")}</p>

          {teamRequests.length === 0 ? (
            <div className="mt-8 border border-border bg-card p-12 text-center text-sm text-muted-foreground">{t("matches.empty_team")}</div>
          ) : (
            <div className="mt-8 grid gap-3">
              {teamRequests.map((r: any) => <TeamRequestHistoryCard key={r.id} request={r} engagement={confirmedByReq.get(r.id)} />)}
            </div>
          )}
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page py-12">
        <div className="label-mono">[MATCHES]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("matches.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(isFreelancer ? "matches.counts_banner_teams" : "matches.counts_banner_freelancers", { count: matches.length })}
        </p>


        {matches.length === 0 ? (
          <div className="mt-8 border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            {isFreelancer ? t("matches.empty") : t("matches.empty_team")}
          </div>
        ) : (
          <div className="mt-8 grid gap-3">
            {matches.map((m: any) => (
              <FreelancerMatchCard
                key={m.id}
                match={m}
                isFreelancer={isFreelancer}
                revealCost={revealCost}
                revealCta={revealCta}
                revealPending={mut.isPending}
                onReveal={async () => { const who = isFreelancer ? t("nav.teams") : t("nav.freelancers"); if (await confirmDialog(revealCost > 0 ? t("matches.reveal_confirm", { count: revealCost, who }) : t("matches.reveal_confirm_free", { who }))) mut.mutate(m.id); }}
              />
            ))}
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );

}
