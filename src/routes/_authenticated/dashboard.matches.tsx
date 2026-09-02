import { confirmDialog } from "@/hooks/use-confirm";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { roleGroupLabel, subRoleLabel } from "@/lib/roles";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getMyMatches, revealMatch, getMyRequests, getMyEngagements } from "@/lib/paddock.functions";
import { Eye, Lock, Star } from "lucide-react";
import { initialsFor, roleLabel, disciplineLabel } from "@/lib/paddock";
import { requestStatusLabel } from "@/lib/labels";
import { formatCriterion } from "@/lib/criteria-label";
import { CalendarQuickButtons } from "@/components/match-quick-actions";
import { BackButton } from "@/components/back-button";
import { PoolBadge } from "@/components/pool-badge";
import { PitCallRevealDetail, PitCallRevealTeaser } from "@/components/pitcall-reveal-detail";
import { MatchRequestActions, MatchRequestDeadline } from "@/components/match-request-actions";

import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/dashboard/matches")({
  component: MatchesPage,
});


function MissingCriteria({ list }: { list: any[] }) {
  const { t } = useTranslation();
  if (!list || list.length === 0) {
    return (
      <div className="mt-3">
        <div className="label-mono mb-1 flex items-center gap-2"><Star className="size-3 text-racing-yellow" /> {t("sweep_engage.matches.criteria")}</div>
        <div className="font-mono text-[11px] text-racing-yellow">{t("sweep_engage.matches.perfect_criteria")}</div>
      </div>
    );
  }
  return (
    <div className="mt-3">
      <div className="label-mono mb-1 flex items-center gap-2"><Star className="size-3 text-racing-yellow" /> {t("sweep_engage.matches.missing_criteria")}</div>
      <div className="flex flex-wrap gap-1">
        {list.map((c: any, i: number) => (
          <span key={i} className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${c.hard ? "border-racing-red text-racing-red" : "border-border text-muted-foreground"}`}>
            {formatCriterion(c, t)}
          </span>
        ))}
      </div>
    </div>
  );
}

function MatchesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const getMatches = useServerFn(getMyMatches);
  const reveal = useServerFn(revealMatch);
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
              {teamRequests.map((r: any) => {
                const eng = confirmedByReq.get(r.id);
                return (
                  <Link
                    key={r.id}
                    to="/dashboard/requests/$id/matches"
                    params={{ id: r.id }}
                    className={`block border p-5 transition-colors hover:border-racing-red ${eng ? "border-racing-yellow bg-racing-yellow/5" : "border-border bg-card"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest">{requestStatusLabel(r.status)}</span>
                          {(r as any).search_mode === "pool" && <PoolBadge />}
                          <span className="font-mono text-[11px] uppercase text-muted-foreground">{roleLabel(r.role)} · {disciplineLabel(r.discipline)}</span>
                        </div>
                        <div className="mt-1 text-lg font-bold">{r.title}</div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground"><PitCallDates request={r} /></div>
                        {eng && (
                          <div className="mt-2 font-mono text-[11px] uppercase tracking-widest text-racing-yellow">
                            {t("sweep_engage.matches.confirmed_match")}: {eng.freelancer?.display_name ?? t("sweep_engage.matches.freelancer_fallback")}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[11px] uppercase text-muted-foreground">{t("sweep_engage.matches.matches_label")}</div>
                        <div className="text-2xl font-black text-racing-red">{eng ? 1 : (r.matches_count ?? 0)}</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
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
          {t("matches.counts_banner", { count: matches.length, who: isFreelancer ? t("nav.teams") : t("nav.freelancers") })}
        </p>


        {matches.length === 0 ? (
          <div className="mt-8 border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            {isFreelancer ? t("matches.empty") : t("matches.empty_team")}
          </div>
        ) : (
          <div className="mt-8 grid gap-3">
            {matches.map((m: any) => {
              const cp = m.counterparty;
              const pct = Math.round(Number(m.match_score ?? 0));
              const perfect = m.is_perfect;
              const isConfirmed = !!m.isConfirmed;
              const matchTaken = !!m.matchTaken;
              const showName = isConfirmed;
              return (
                <div key={m.id} className={`grid gap-4 border p-5 md:grid-cols-[1fr,auto] md:items-start ${perfect ? "border-racing-yellow bg-racing-yellow/5" : "border-border bg-card"}`}>
                  <div className="flex items-start gap-4">
                    <div className={`flex size-12 shrink-0 items-center justify-center font-mono text-sm font-black ${showName ? "bg-racing-red text-white" : "bg-secondary text-muted-foreground"}`}>
                      {showName
                        ? initialsFor((isFreelancer ? (cp?.team_name ?? "?") : (cp?.legal_name ?? "?")))
                        : <Lock className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-2xl font-black italic tracking-tighter ${perfect ? "text-racing-yellow" : "text-racing-red"}`}>
                        {pct}% <span className="font-mono text-[11px] uppercase tracking-widest">{perfect ? t("sweep_engage.matches.perfect_match") : t("sweep_engage.matches.match_label")}</span>
                      </div>
                      {showName ? (
                        <div className="mt-1 text-lg font-bold">
                          {isFreelancer ? (cp?.team_name ?? t("sweep_engage.matches.team_fallback")) : (cp?.legal_name ?? t("sweep_engage.matches.freelancer_fallback"))}
                        </div>
                      ) : !m.revealedByMe ? (
                        <div className="mt-1 text-lg font-bold">
                          {t("matches.hidden_name")}
                        </div>
                      ) : null}

                      {m.revealedByMe && cp && (
                        <div className="mt-2 grid gap-1 text-xs">
                          {isFreelancer ? (
                            <>
                              {cp.team_type && <div><span className="text-muted-foreground">{t("sweep_engage.matches.type_label")}:</span> <span className="font-medium">{cp.team_type}</span></div>}
                              {cp.location && <div><span className="text-muted-foreground">{t("sweep_engage.matches.location_label")}:</span> <span className="font-medium">{cp.location}</span></div>}
                              {cp.bio && <div className="mt-2 text-muted-foreground">{cp.bio}</div>}
                              {!isConfirmed && (
                                <div className="mt-2 rounded border border-border bg-background/50 p-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                  {t("sweep_engage.matches.team_name_hidden")}
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              {cp.headline && <div className="font-medium">{cp.headline}</div>}
                              {cp.location && <div><span className="text-muted-foreground">{t("sweep_engage.matches.location_label")}:</span> <span className="font-medium">{cp.location}</span></div>}
                              {typeof cp.day_rate === "number" && <div><span className="text-muted-foreground">{t("sweep_engage.matches.day_rate_label")}:</span> <span className="font-medium">€{cp.day_rate}</span></div>}
                              {cp.travels !== null && <div><span className="text-muted-foreground">{t("sweep_engage.matches.travels_label")}:</span> <span className="font-medium">{cp.travels ? t("sweep_engage.matches.yes") : t("sweep_engage.matches.no")}</span></div>}
                              {cp.bio && <div className="mt-2 text-muted-foreground">{cp.bio}</div>}
                              {isConfirmed && (cp.contact_email || cp.phone_number) && (
                                <div className="mt-2 grid gap-1">
                                  {cp.contact_email && <div><span className="text-muted-foreground">Email:</span> <span className="font-medium break-all">{cp.contact_email}</span></div>}
                                  {cp.phone_number && <div><span className="text-muted-foreground">{t("phone.label")}:</span> <span className="font-medium">{cp.phone_dial_code ?? ""} {cp.phone_number}</span></div>}
                                </div>
                              )}
                              {!isConfirmed && (
                                <div className="mt-2 rounded border border-border bg-background/50 p-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                  {t("sweep_engage.matches.name_contacts_hidden")}
                                </div>
                              )}

                            </>
                          )}
                        </div>
                      )}
                      <MissingCriteria list={m.missing_criteria ?? []} />
                      <div className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">{m.request?.title}</div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {m.request?.start_date} → {m.request?.end_date} · {m.request?.sub_role ? subRoleLabel(m.request.sub_role) : roleGroupLabel(m.request?.role_group)} · {disciplineLabel(m.request?.discipline)}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-racing-yellow">{t("sweep_engage.matches.overlap", { count: m.overlap_days })}</div>
                      {isFreelancer && (m.revealedByMe ? <PitCallRevealDetail detail={m.requestDetail} /> : <PitCallRevealTeaser />)}

                      {isConfirmed && m.request?.start_date && m.request?.end_date && (
                        <div className="mt-3 border-t border-racing-yellow/30 pt-3">
                          <div className="label-mono mb-2 text-racing-yellow">[ADD TO CALENDAR]</div>
                          <CalendarQuickButtons
                            event={{
                              title: t("sweep_engage.matches.calendar_title", { title: m.request?.title ?? "PitCall" }),
                              startDate: m.request.start_date,
                              endDate: m.request.end_date,
                              location: m.request?.location ?? m.request?.circuit ?? null,
                              description: m.request?.notes ?? "",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-stretch gap-2">
                    {m.revealedByMe ? (
                      <span className="inline-flex items-center justify-center gap-1 border border-racing-red/40 bg-racing-red/10 px-3 py-2 font-mono text-[11px] uppercase text-racing-red">
                        <Eye className="size-3.5" /> {t("matches.already_revealed")}
                      </span>
                    ) : (
                      <button
                        onClick={async () => { if (await confirmDialog(t("matches.reveal_confirm", { who: isFreelancer ? t("nav.teams") : t("nav.freelancers") }))) mut.mutate(m.id); }}
                        disabled={mut.isPending || matchTaken}
                        className="bg-racing-red px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
                      >
                        {t("matches.reveal_1_token")}
                      </button>
                    )}
                    {isFreelancer && m.pending_engagement_id && !matchTaken && !isConfirmed && (
                      <>
                        <MatchRequestDeadline expiresAt={m.pending_engagement?.expires_at} />
                        <MatchRequestActions
                          engagementId={m.pending_engagement_id}
                          expiresAt={m.pending_engagement?.expires_at}
                          extensionCount={m.pending_engagement?.extension_count ?? 0}
                          pitcallStart={m.request?.start_date ?? null}
                        />
                      </>
                    )}
                    {isFreelancer && matchTaken && (
                      <span className="inline-flex items-center justify-center border border-border bg-secondary/60 px-3 py-2 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {t("sweep_engage.matches.assigned_elsewhere")}
                      </span>
                    )}
                    {isFreelancer && isConfirmed && (
                      <span className="inline-flex items-center justify-center border border-racing-yellow bg-racing-yellow/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-racing-yellow">
                        {t("sweep_engage.matches.match_confirmed_badge")}
                      </span>
                    )}

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );

}
