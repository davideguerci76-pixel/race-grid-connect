import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getMyMatches, revealMatch } from "@/lib/paddock.functions";
import { Eye, Lock } from "lucide-react";
import { initialsFor } from "@/lib/paddock";

export const Route = createFileRoute("/_authenticated/dashboard/matches")({
  component: MatchesPage,
});

function MatchesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const getMatches = useServerFn(getMyMatches);
  const reveal = useServerFn(revealMatch);

  const { data } = useQuery({ queryKey: ["matches"], queryFn: () => getMatches() });
  const matches = data?.matches ?? [];
  const isFreelancer = data?.userType === "freelancer";

  const mut = useMutation({
    mutationFn: (id: string) => reveal({ data: { match_id: id } }),
    onSuccess: () => { toast.success("Revealed"); qc.invalidateQueries(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("matches.insufficient_tokens")),
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
            {matches.map((m) => {
              const counterparty = isFreelancer ? m.team : m.freelancer;
              return (
                <div key={m.id} className="grid gap-4 border border-border bg-card p-5 md:grid-cols-[1fr,auto] md:items-center">
                  <div className="flex items-start gap-4">
                    <div className={`flex size-12 items-center justify-center font-mono text-sm font-black ${m.revealedByMe ? "bg-racing-red text-white" : "bg-secondary text-muted-foreground"}`}>
                      {m.revealedByMe ? initialsFor(counterparty?.display_name ?? "?") : <Lock className="size-4" />}
                    </div>
                    <div>
                      <div className="font-bold">{m.revealedByMe ? counterparty?.display_name : t("matches.hidden_name")}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{m.request?.title}</div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {m.request?.start_date} → {m.request?.end_date} · {t(`role.${m.request?.role}`)} · {t(`discipline.${m.request?.discipline}`)}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-racing-yellow">Overlap: {m.overlap_days} day(s)</div>
                    </div>
                  </div>
                  <div>
                    {m.revealedByMe ? (
                      <span className="inline-flex items-center gap-1 border border-racing-red/40 bg-racing-red/10 px-3 py-2 font-mono text-[11px] uppercase text-racing-red">
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
