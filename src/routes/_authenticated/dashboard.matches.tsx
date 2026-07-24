import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getMyMatches, revealMatch, confirmEngagement } from "@/lib/paddock.functions";
import { Eye, Lock, Star } from "lucide-react";
import { initialsFor } from "@/lib/paddock";

export const Route = createFileRoute("/_authenticated/dashboard/matches")({
  component: MatchesPage,
});

function formatCriterion(c: any): string {
  switch (c.kind) {
    case "role": return `Role: ${c.label ?? ""}`;
    case "skill": return `Skill: ${c.label}`;
    case "language": return `Lang: ${c.code} (${c.level})`;
    case "education": return "Education";
    case "day_rate": return "Day rate over budget";
    case "location": return `Location: ${c.label ?? "distant"}`;
    default: return c.kind ?? "criterion";
  }
}

function MissingCriteria({ list }: { list: any[] }) {
  if (!list || list.length === 0) {
    return (
      <div className="mt-3">
        <div className="label-mono mb-1 flex items-center gap-2"><Star className="size-3 text-racing-yellow" /> Criteria</div>
        <div className="font-mono text-[11px] text-racing-yellow">All soft criteria satisfied — perfect match</div>
      </div>
    );
  }
  return (
    <div className="mt-3">
      <div className="label-mono mb-1 flex items-center gap-2"><Star className="size-3 text-racing-yellow" /> Missing / partial criteria</div>
      <div className="flex flex-wrap gap-1">
        {list.map((c: any, i: number) => (
          <span key={i} className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${c.hard ? "border-racing-red text-racing-red" : "border-border text-muted-foreground"}`}>
            {formatCriterion(c)}
          </span>
        ))}
      </div>
    </div>
  );
}

function MatchesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const getMatches = useServerFn(getMyMatches);
  const reveal = useServerFn(revealMatch);
  const acceptFn = useServerFn(confirmEngagement);

  const { data } = useQuery({ queryKey: ["matches"], queryFn: () => getMatches() });
  const matches = data?.matches ?? [];
  const isFreelancer = data?.userType === "freelancer";

  // Teams manage their matches per-request from the Requests dashboard.
  useEffect(() => {
    if (data && data.userType === "team") {
      navigate({ to: "/dashboard/requests", replace: true });
    }
  }, [data, navigate]);

  const mut = useMutation({
    mutationFn: (id: string) => reveal({ data: { match_id: id } }),
    onSuccess: () => { toast.success("Revealed"); qc.invalidateQueries(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("matches.insufficient_tokens")),
  });

  const acceptMut = useMutation({
    mutationFn: (engagement_id: string) => acceptFn({ data: { id: engagement_id } }),
    onSuccess: () => { toast.success("Confirmed — contacts unlocked"); qc.invalidateQueries(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),

  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
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
              const counterparty = isFreelancer ? m.team : m.freelancer;
              const cp = m.counterparty;
              const pct = Math.round(Number(m.match_score ?? 0));
              const perfect = m.is_perfect;
              const requestFilled = m.request?.status === "filled";
              return (
                <div key={m.id} className={`grid gap-4 border p-5 md:grid-cols-[1fr,auto] md:items-start ${perfect ? "border-racing-yellow bg-racing-yellow/5" : "border-border bg-card"}`}>
                  <div className="flex items-start gap-4">
                    <div className={`flex size-12 shrink-0 items-center justify-center font-mono text-sm font-black ${m.revealedByMe ? "bg-racing-red text-white" : "bg-secondary text-muted-foreground"}`}>
                      {m.revealedByMe ? initialsFor((isFreelancer ? cp?.team_name : counterparty?.display_name) ?? counterparty?.display_name ?? "?") : <Lock className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-2xl font-black italic tracking-tighter ${perfect ? "text-racing-yellow" : "text-racing-red"}`}>
                        {pct}% <span className="font-mono text-[11px] uppercase tracking-widest">{perfect ? "Perfect match" : "Match"}</span>
                      </div>
                      <div className="mt-1 text-lg font-bold">
                        {m.revealedByMe
                          ? (isFreelancer ? (cp?.team_name ?? counterparty?.display_name) : (counterparty?.display_name))
                          : t("matches.hidden_name")}
                      </div>
                      {m.revealedByMe && cp && (
                        <div className="mt-2 grid gap-1 text-xs">
                          {isFreelancer ? (
                            <>
                              {cp.team_type && <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">{cp.team_type}</span></div>}
                              {cp.location && <div><span className="text-muted-foreground">Location:</span> <span className="font-medium">{cp.location}</span></div>}
                              {cp.contact_email && <div><span className="text-muted-foreground">Contact:</span> <a href={`mailto:${cp.contact_email}`} className="font-medium text-racing-red hover:underline">{cp.contact_email}</a></div>}
                              {cp.website && <div><span className="text-muted-foreground">Website:</span> <a href={cp.website} target="_blank" rel="noopener" className="font-medium text-racing-red hover:underline">{cp.website}</a></div>}
                              {cp.bio && <div className="mt-2 text-muted-foreground">{cp.bio}</div>}
                              <div className="mt-2">
                                <a href={`/teams/${m.team_id}?req=${m.request?.id ?? ""}`} className="inline-block border border-racing-red px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10">View team profile →</a>
                              </div>
                            </>
                          ) : (
                            <>
                              {cp.headline && <div className="font-medium">{cp.headline}</div>}
                              {cp.location && <div><span className="text-muted-foreground">Location:</span> <span className="font-medium">{cp.location}</span></div>}
                              {typeof cp.day_rate === "number" && <div><span className="text-muted-foreground">Day rate:</span> <span className="font-medium">€{cp.day_rate}</span></div>}
                              {cp.travels !== null && <div><span className="text-muted-foreground">Travels:</span> <span className="font-medium">{cp.travels ? "Yes" : "No"}</span></div>}
                              {cp.contact_email && <div><span className="text-muted-foreground">Contact:</span> <a href={`mailto:${cp.contact_email}`} className="font-medium text-racing-red hover:underline">{cp.contact_email}</a></div>}
                              {cp.bio && <div className="mt-2 text-muted-foreground">{cp.bio}</div>}
                              <div className="mt-2">
                                <a href={`/freelancers/${m.freelancer_id}`} className="inline-block border border-racing-red px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10">View full profile →</a>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      <MissingCriteria list={m.missing_criteria ?? []} />
                      <div className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">{m.request?.title}</div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {m.request?.start_date} → {m.request?.end_date} · {t(`role.${m.request?.role}`)} · {t(`discipline.${m.request?.discipline}`)}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-racing-yellow">Overlap: {m.overlap_days} day(s)</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-stretch gap-2">
                    {m.revealedByMe ? (
                      <span className="inline-flex items-center justify-center gap-1 border border-racing-red/40 bg-racing-red/10 px-3 py-2 font-mono text-[11px] uppercase text-racing-red">
                        <Eye className="size-3.5" /> {t("matches.already_revealed")}
                      </span>
                    ) : (
                      <button
                        onClick={() => { if (confirm(t("matches.reveal_confirm", { who: isFreelancer ? t("nav.teams") : t("nav.freelancers") }))) mut.mutate(m.id); }}
                        disabled={mut.isPending}
                        className="bg-racing-red px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
                      >
                        {t("matches.reveal_1_token")}
                      </button>
                    )}
                    {isFreelancer && m.pending_engagement_id && !requestFilled && (
                      <button
                        onClick={() => {
                          if (confirm("Confirm this engagement? Your contact details will be shared with the team and the job will be marked as filled.")) {
                            acceptMut.mutate(m.pending_engagement_id);
                          }
                        }}
                        disabled={acceptMut.isPending}
                        className="bg-racing-red px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
                      >
                        {t("engagements.confirm")}
                      </button>
                    )}
                    {isFreelancer && requestFilled && (
                      <span className="inline-flex items-center justify-center border border-racing-yellow bg-racing-yellow/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-racing-yellow">
                        Request filled
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
