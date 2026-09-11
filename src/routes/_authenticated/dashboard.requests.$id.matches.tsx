import { confirmDialog } from "@/hooks/use-confirm";
import { HelpHint } from "@/components/help-hint";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Unlock, ArrowLeft, AlertTriangle, Flame, Pencil, Play, Ban } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getRequestMatches, unlockMatch, requestMatchConfirmation, unlockRequestTier, triggerSosCall, refundAndCloseRequest, upgradeRequestToStandard, activateRequestNow, redCancelRequest } from "@/lib/paddock.functions";
import { BackButton } from "@/components/back-button";
import { PitCallSummary } from "@/components/pitcall-summary";
import { CandidateMatchCard, LockedCandidateCard } from "@/components/cards/candidate-match-card";
import { HiredFreelancerCard } from "@/components/cards/hired-freelancer-card";

import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/dashboard/requests/$id/matches")({
  head: () => ({
    meta: [
      { title: "Pit Call Matches | PitCall" },
      { name: "description", content: "Review full and partial freelancer matches for a PitCall request." },
      { property: "og:title", content: "Pit Call Matches | PitCall" },
      { property: "og:description", content: "Review full and partial freelancer matches for a PitCall request." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestMatchesPage,
});

function RequestMatchesPage() {
  const { t } = useTranslation();
  const { id } = useParams({ from: "/_authenticated/dashboard/requests/$id/matches" });
  const qc = useQueryClient();
  const fetchMatches = useServerFn(getRequestMatches);
  const unlockFn = useServerFn(unlockMatch);
  const unlockTierFn = useServerFn(unlockRequestTier);
  

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["request-matches", id],
    queryFn: () => fetchMatches({ data: { request_id: id } }),
    retry: false,
    // While an SOS is open the Team is waiting for the first accept: poll so the page
    // flips to FILLED / hired without a manual reload.
    refetchInterval: (q) => ((q.state.data as any)?.sos_active ? 10_000 : false),
  });


  const [reviewNow, setReviewNow] = useState(() => Date.now());
  const reviewDeadline = (data as any)?.review_deadline_at ?? null;
  const inReview = Boolean((data as any)?.in_review || (data as any)?.request?.status === "pending_review");
  useEffect(() => {
    if (!inReview || !reviewDeadline) return;
    const timer = window.setInterval(() => setReviewNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [inReview, reviewDeadline]);


  const unlockMut = useMutation({
    mutationFn: (match_id: string) => unlockFn({ data: { match_id } }),
    onSuccess: (r) => {
      toast.success(t("sweep_engage.request_matches.unlock_success", { balance: r.balance }));
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["token-balance"] });
    },
    onError: (e) => toastError(e, "sweep_engage.request_matches.unlock_failed"),
  });

  const tierMut = useMutation({
    mutationFn: (args: { tier: number; scope: "full" | "partial" }) =>
      unlockTierFn({ data: { request_id: id, tier: args.tier, scope: args.scope } }),
    onSuccess: (r) => {
      toast.success(t("sweep_engage.request_matches.tier_unlock_success", { tier: r.tier, scope: r.scope, spent: r.tokens_spent, balance: r.balance }));
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["token-balance"] });
    },
    onError: (e) => toastError(e, "sweep_engage.request_matches.tier_unlock_failed"),
  });

  const confirmFn = useServerFn(requestMatchConfirmation);
  const confirmMut = useMutation({
    mutationFn: (match_id: string) => confirmFn({ data: { match_id } }),
    onSuccess: () => {
      toast.success(t("sweep_engage.request_matches.confirmation_sent"));
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["engagements"] });
    },
    onError: (e) => toastError(e, "sweep_engage.common.failed"),
  });

  const sosFn = useServerFn(triggerSosCall);
  const sosMut = useMutation({
    mutationFn: () => sosFn({ data: { request_id: id } }),
    onSuccess: (r: any) => {
      toast.success(t("sweep_engage.request_matches.sos_sent", { count: r?.target_count ?? 0, pct: r?.min_pct ?? 40 }));
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
    },
    onError: (e) => toastError(e, "sweep_engage.request_matches.sos_failed"),
  });

  const refundFn = useServerFn(refundAndCloseRequest);
  const activateNowFn = useServerFn(activateRequestNow);
  const redCancelFn = useServerFn(redCancelRequest);
  const refundMut = useMutation({
    mutationFn: (mode: "full" | "partial") => refundFn({ data: { request_id: id, mode } }),
    onSuccess: (r: any) => {
      toast.success(t("sweep_engage.request_matches.refund_credited", { tokens: r?.refund_tokens ?? 0, pct: r?.refund_pct ?? 0 }));
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["token-balance"] });
    },
    onError: (e) => toastError(e, "sweep_engage.request_matches.refund_failed"),
  });
  const activateMut = useMutation({
    mutationFn: () => activateNowFn({ data: { request_id: id } }),
    onSuccess: () => {
      toast.success(t("sweep_engage.request_matches.activated_now"));
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
    },
    onError: (e) => toastError(e, "sweep_engage.request_matches.activate_failed"),
  });
  const redCancelMut = useMutation({
    mutationFn: () => redCancelFn({ data: { request_id: id } }),
    onSuccess: (r) => {
      toast.success(t("sweep_engage.request_matches.red_cancelled", { tokens: r.refund_tokens }));
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["token-balance"] });
    },
    onError: (e) => toastError(e, "sweep_engage.request_matches.red_cancel_failed"),
  });

  const requestFilled = data?.request?.status === "filled" || data?.request?.status === "completed";
  const matchPotential = ((data as any)?.match_potential ?? null) as "strong" | "targeted" | "red" | null;
  const reviewRemainingMs = reviewDeadline ? Math.max(0, new Date(reviewDeadline).getTime() - reviewNow) : 0;
  const reviewMinutes = Math.floor(reviewRemainingMs / 60000);
  const reviewSeconds = Math.floor((reviewRemainingMs % 60000) / 1000);
  const reviewCountdown = reviewMinutes >= 60
    ? `${Math.floor(reviewMinutes / 60)}h ${String(reviewMinutes % 60).padStart(2, "0")}m`
    : `${reviewMinutes}m ${String(reviewSeconds).padStart(2, "0")}s`;
  const potentialTone = matchPotential === "strong"
    ? "border-emerald-400/70 bg-emerald-400/10 text-emerald-300"
    : matchPotential === "targeted"
      ? "border-racing-yellow/70 bg-racing-yellow/10 text-racing-yellow"
      : "border-racing-red/70 bg-racing-red/10 text-racing-red";
  // SOS authority v2: available from the first required day until the last one, also when the
  // Pit Call is FILLED (the click is then a Team-declared no-show). Server-side is authoritative.
  const todayIso = new Date().toISOString().slice(0, 10);
  const sosWindowOpen = Boolean(
    data?.request?.start_date && todayIso >= data.request.start_date && todayIso <= (data.request.end_date ?? data.request.start_date),
  );
  const sosStatusOk = !["closed", "completed", "paused", "pending_review"].includes(String(data?.request?.status ?? ""));
  const sosEligible = Boolean(data?.request && sosStatusOk && !inReview && sosWindowOpen && data.request.duration !== "full_season");
  const sosDeclaresNoShow = sosEligible && data?.request?.status === "filled";
  // SOS exclusive mode is server-derived (unresolved sos_calls row). While active, the Team
  // must not see normal candidate CTAs: the first freelancer to accept wins.
  const sosActive = ((data as any)?.sos_active ?? null) as { id: string; triggered_at: string; target_count: number; min_pct: number; radius_km: number } | null;
  const isPoolRequest = (data?.request as any)?.search_mode === "pool";
  const fullItems = Array.isArray(data?.items) ? data.items : [];
  const partialItems = Array.isArray(data?.items_partial) ? data.items_partial : [];
  const expandAvailable = Boolean((data as any)?.expand_available);
  const upgradeCost = Number((data as any)?.upgrade_cost ?? 0);
  const upgradeFn = useServerFn(upgradeRequestToStandard);
  const upgradeMut = useMutation({
    mutationFn: () => upgradeFn({ data: { request_id: id } }),
    onSuccess: (r: any) => {
      toast.success(t("pool.upgrade_done", { cost: r?.tokens_spent ?? upgradeCost }));
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["my-requests"] });
      qc.invalidateQueries({ queryKey: ["token-balance"] });
    },
    onError: (e: any) => toastError(e, "pool.upgrade_failed"),
  });

  const renderPool = (
    label: string,
    scope: "full" | "partial",
    tiers: any[],
    items: any[],
    compact = false,
  ) => {
    return (
      <div>
        {(Array.isArray(tiers) ? tiers : []).map((tierInfo) => {
          if ((tierInfo?.real_count ?? 0) === 0) return null;
          const safeItems = Array.isArray(items) ? items : [];
          const tierItems = safeItems.filter((i) => i?.tier === tierInfo.tier);
          const isLocked = !tierInfo.unlocked;
          return (
            <section key={`${scope}-${tierInfo.tier}`} className={compact ? "mt-4 first:mt-0" : "mt-8"}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2">
                <div>
                  <div className="label-mono">
                    [{label} · TIER {tierInfo.tier}] {(() => {
                      const t2 = (Array.isArray(tiers) ? tiers : []).find((x) => x?.tier === 2)?.size ?? 10;
                      if (tierInfo.tier === 1) return t("sweep_engage.request_matches.top_matches_1_10");
                      if (tierInfo.tier === 2) return t("sweep_engage.request_matches.matches_range", { from: 11, to: 10 + (tierInfo.size ?? 0) });
                      return t("sweep_engage.request_matches.matches_range", { from: 11 + t2, to: 10 + t2 + (tierInfo.size ?? 0) });
                    })()}
                  </div>
                  <div className="mt-1 text-xl font-black italic tracking-tighter">
                    {tierInfo.tier === 1 ? t("sweep_engage.request_matches.free_preview") : tierInfo.unlocked ? t("sweep_engage.request_matches.unlocked_label") : t("sweep_engage.request_matches.locked_to_open", { count: tierInfo.entry_cost ?? 0 })}
                  </div>
                  <div className="font-mono text-[11px] uppercase text-muted-foreground">
                    {t("sweep_engage.request_matches.real_matches_in_tier", { count: tierInfo.real_count ?? 0 })}
                  </div>
                </div>
                {isLocked && (
                  <div className="max-w-md text-right">
                    {tierInfo.proportional && (
                      <div className="mb-2 flex items-start gap-2 border border-racing-yellow/50 bg-racing-yellow/10 p-2 text-left font-mono text-[11px] text-racing-yellow">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                        <span>
                          {t("sweep_engage.request_matches.proportional_note", { count: tierInfo.real_count ?? 0, max: tierInfo.size ?? 0, full: tierInfo.entry_cost_full ?? 0, cost: tierInfo.entry_cost ?? 0 })}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={async () => {
                        const msg = tierInfo.proportional
                          ? t("sweep_engage.request_matches.unlock_tier_confirm_reduced", { label: label.toLowerCase(), tier: tierInfo.tier, cost: tierInfo.entry_cost ?? 0, full: tierInfo.entry_cost_full ?? 0, count: tierInfo.real_count ?? 0 })
                          : t("sweep_engage.request_matches.unlock_tier_confirm", { label: label.toLowerCase(), tier: tierInfo.tier, cost: tierInfo.entry_cost ?? 0, count: tierInfo.real_count ?? 0 });
                        if (await confirmDialog(msg)) tierMut.mutate({ tier: tierInfo.tier, scope });
                      }}
                      disabled={tierMut.isPending}
                      className="bg-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
                    >
                      <Unlock className="mr-1 inline size-3" /> {t("sweep_engage.request_matches.unlock_tier_button", { tier: tierInfo.tier, cost: tierInfo.entry_cost ?? 0 })}
                    </button>
                  </div>
                )}
              </div>

              {isLocked ? (
                <div className="grid gap-3">
                  {Array.from({ length: tierInfo.real_count ?? 0 }).map((_, i) => (
                    <LockedCandidateCard key={i} rank={(tierInfo.tier === 2 ? 11 : 11 + ((Array.isArray(tiers) ? tiers : []).find((x) => x?.tier === 2)?.size ?? 10)) + i} />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3">
                  {tierItems.map((m) => (
                    <CandidateMatchCard
                      key={m.match_id}
                      match={m}
                      perProfileCost={data!.per_profile_cost}
                      requestFilled={!!requestFilled}
                      sosMode={sosActive ? ((m as any).sos_target ? "target" : "excluded") : null}
                      onUnlock={() => unlockMut.mutate(m.match_id)}
                      onConfirm={async () => {
                        if (await confirmDialog(t("sweep_engage.request_matches.confirm_match_prompt"))) {
                          confirmMut.mutate(m.match_id);
                        }
                      }}
                      loading={unlockMut.isPending || confirmMut.isPending}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page py-10">
        <Link to="/dashboard/requests" className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> {t("sweep_engage.request_matches.back_to_pit_calls")}
        </Link>
        {!isLoading && error && (
          <div className="border border-destructive/40 bg-destructive/5 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="size-4" /> {error instanceof Error ? error.message : "Pit Call unavailable"}
            </div>
            <Link to="/dashboard/requests" className="mt-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3" /> {t("sweep_engage.request_matches.back_to_pit_calls")}
            </Link>
          </div>
        )}

        {isLoading && <div className="text-sm text-muted-foreground">{t("sweep_engage.common.loading")}</div>}

        {data && (
          <>
            <PitCallSummary request={data.request as never} />

            {inReview && (
              <section className="mt-5 border-2 border-racing-yellow/70 bg-racing-yellow/5 p-5" aria-live="polite">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="label-mono text-racing-yellow">[{t("sweep_engage.request_matches.pitcall_preview_title")}]</div>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                      {t("sweep_engage.request_matches.pitcall_preview_body")}
                    </p>
                  </div>
                  <div className="shrink-0 border border-racing-yellow/60 px-3 py-2 text-right">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("sweep_engage.request_matches.review_remaining")}</div>
                    <div className="mt-1 font-mono text-xl font-bold tabular-nums text-racing-yellow">{reviewCountdown}</div>
                  </div>
                </div>
                <div className={`mt-4 inline-flex items-center gap-2 border px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest ${potentialTone}`}>
                  <span>{t("sweep_engage.request_matches.match_potential")}</span>
                  <span aria-label={matchPotential ? t(`sweep_engage.request_matches.potential_${matchPotential}`) : "—"}>
                    {matchPotential ? t(`sweep_engage.request_matches.potential_${matchPotential}`) : "—"}
                  </span>
                </div>
                {(() => {
                  const state = (data as any).modify_state ?? {};
                  return (
                    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-racing-yellow/30 pt-4">
                      <Link to="/dashboard/requests/new" search={{ from: id, mode: "modify" }} className="inline-flex items-center gap-2 border border-racing-yellow px-4 py-2 text-xs font-bold uppercase tracking-widest text-racing-yellow hover:bg-racing-yellow/10">
                        <Pencil className="size-3" /> {t("sweep_engage.request_matches.modify_button")}
                      </Link>
                      <button onClick={async () => { if (await confirmDialog(t("sweep_engage.request_matches.activate_now_confirm"))) activateMut.mutate(); }} disabled={activateMut.isPending} className="inline-flex items-center gap-2 border border-border px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-secondary disabled:opacity-60">
                        <Play className="size-3" /> {t("sweep_engage.request_matches.activate_now_button")}
                      </button>
                      {state.red_cancel_eligible && (() => {
                        // The CTA mirrors the server quote: it only appears when
                        // red_cancel_quote() says yes, and it never promises a
                        // refund the authority would return as zero.
                        const refundTokens = Number(state.red_cancel_refund_tokens ?? 0);
                        const noRefund = refundTokens <= 0;
                        return (
                          <button
                            onClick={async () => {
                              const msg = noRefund
                                ? t("sweep_engage.request_matches.red_cancel_confirm_no_refund")
                                : `${t("sweep_engage.request_matches.red_cancel_confirm")} ${t("sweep_engage.request_matches.red_cancel_refund_hint", { tokens: refundTokens })}`;
                              if (await confirmDialog(msg)) redCancelMut.mutate();
                            }}
                            disabled={redCancelMut.isPending}
                            className="inline-flex items-center gap-2 border border-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10 disabled:opacity-60"
                          >
                            <Ban className="size-3" />{" "}
                            {noRefund
                              ? t("sweep_engage.request_matches.red_cancel_button_no_refund")
                              : t("sweep_engage.request_matches.red_cancel_button")}
                          </button>
                        );
                      })()}
                      {state.red_cancel_quote_available === false && (
                        // The server could not evaluate red_cancel_quote(). This is NOT a
                        // legitimate "not eligible": no client-side eligibility or refund is
                        // derived here — the Team is told the check is temporarily unavailable.
                        <div className="inline-flex items-center gap-2 border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          <AlertTriangle className="size-3 text-racing-yellow" />
                          {t("sweep_engage.request_matches.red_cancel_unavailable")}
                          <button
                            type="button"
                            onClick={() => refetch()}
                            disabled={isFetching}
                            className="underline underline-offset-2 hover:text-foreground disabled:opacity-60"
                          >
                            {t("sweep_engage.request_matches.red_cancel_retry")}
                          </button>
                        </div>
                      )}

                      <span className="font-mono text-[10px] uppercase text-muted-foreground">{t("sweep_engage.request_matches.modify_budget_status", { used: state.modify_count ?? 0, max: state.max_modify ?? 3, left: state.budget_left ?? 0 })}</span>
                    </div>
                  );
                })()}
              </section>
            )}

            {!inReview && (
              <>


            <div className="border border-border bg-card p-5">
              <p className="text-xs text-muted-foreground">
                {t("sweep_engage.request_matches.matches_intro_1")} <span className="font-bold text-racing-yellow">{t("sweep_engage.request_matches.top3")}</span> {t("sweep_engage.request_matches.matches_intro_2", { cost: data.per_profile_cost, hardCap: data.hard_cap })}
              </p>
              <div className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {t("sweep_engage.request_matches.total_matches_summary", { full: data.total_matches, partial: data.total_partial_matches, cap: data.hard_cap })}
              </div>

              {/* What an unlock actually buys — mirrors the server entitlement exactly. */}
              <div className="mt-4 border-t border-border pt-3">
                <div className="label-mono">[{t("sweep_engage.request_matches.unlock_explainer_title")}]</div>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <li>· {t("sweep_engage.request_matches.unlock_explainer_visible")}</li>
                  <li className="text-foreground">· {t("sweep_engage.request_matches.unlock_explainer_buys")}</li>
                  <li>· {t("sweep_engage.request_matches.unlock_explainer_hidden")}</li>
                </ul>
              </div>

              {sosActive && (
                <div className="mt-4 border-2 border-racing-red bg-racing-red/10 p-4">
                  <div className="label-mono text-racing-red">
                    <Flame className="mr-1 inline size-3 animate-pulse" /> {t("sos.team_banner_title")}
                  </div>
                  <p className="mt-1 text-sm text-foreground">
                    {sosActive.target_count > 0
                      ? t("sos.team_banner_body", { count: sosActive.target_count, radius: sosActive.radius_km, pct: sosActive.min_pct })
                      : t("sos.team_banner_no_targets", { radius: sosActive.radius_km, pct: sosActive.min_pct })}
                  </p>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("sos.team_manual_locked")}</p>
                </div>
              )}

              {sosEligible && !sosActive && (
                <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-2 border-racing-red bg-racing-red/10 p-4">
                  <div className="min-w-0">
                    <div className="label-mono text-racing-red">[SOS CALL]</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("sweep_engage.request_matches.sos_description")}
                    </p>
                    {sosDeclaresNoShow && (
                      <p className="mt-1 text-xs font-semibold text-racing-red">
                        {t("sweep_engage.request_matches.sos_no_show_notice")}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      if (await confirmDialog(t("sweep_engage.request_matches.sos_confirm"))) {
                        sosMut.mutate();
                      }
                    }}
                    disabled={sosMut.isPending}
                    className="bg-racing-red px-4 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
                  >
                    <Flame className="mr-1 inline size-3" /> {t("sweep_engage.request_matches.trigger_sos_button")}
                  </button>
                </div>
              )}
            </div>


            {data.hired && <HiredFreelancerCard hired={data.hired} request={data.request} />}

            {/* Economic panel — rendered strictly from the server economic state. */}
            {!requestFilled && !inReview && (data as any).refund_state && (
              <EconomicPanel
                state={(data as any).refund_state}
                onWait={() => toast.info(t("sweep_engage.request_matches.search_stays_active"))}
                onClose={async () => {
                  const s = (data as any).refund_state;
                  if (await confirmDialog(t("sweep_engage.request_matches.econ_close_confirm", { tokens: s.best_refund }))) {
                    refundMut.mutate("full");
                  }
                }}
                loading={refundMut.isPending}
              />
            )}

            {isPoolRequest && expandAvailable && (
              <div className="mt-6 border-2 border-racing-yellow bg-racing-yellow/5 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="label-mono text-racing-yellow">{t("pool.upgrade_label")}</span>
                      <HelpHint titleKey="help.concept.expand_outside_pool.title" bodyKey="help.concept.expand_outside_pool.body" />
                    </div>
                    <p className="mt-2 text-sm">
                      {t("pool.upgrade_desc")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("pool.upgrade_hint", { cost: upgradeCost })}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (await confirmDialog(t("pool.upgrade_confirm", { cost: upgradeCost }))) {
                        upgradeMut.mutate();
                      }
                    }}
                    disabled={upgradeMut.isPending}
                    className="shrink-0 bg-racing-yellow px-5 py-3 text-xs font-black uppercase tracking-widest text-carbon hover:brightness-110 disabled:opacity-60"
                  >
                    {t("pool.upgrade_button", { cost: upgradeCost })}
                  </button>
                </div>
              </div>
            )}

            {/* Partial matches are always rendered in their own section below:
                the old "want to see them?" FOMO banner was removed (STEP 6.9.R.2)
                because its copy/CTA falsely suggested partials were still hidden.
                The refund/economic banner (refund_state) is a separate component
                above and is fully preserved. */}

            <div className="mt-8 grid items-start gap-6 md:grid-cols-2">
              <section className="border border-border bg-card p-4">
                <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-b border-border pb-3">
                  <div className="min-w-0">
                    <div className="label-mono truncate">[{t("pool.column_full")}]</div>
                    <h2 className="text-2xl font-black uppercase italic tracking-tighter">{t("pool.column_full")}</h2>
                  </div>
                  <div className="shrink-0 font-mono text-[11px] uppercase text-racing-yellow">{fullItems.length}</div>
                </div>
                {fullItems.length > 0 ? renderPool(t("pool.column_full"), "full", data.tiers ?? [], fullItems, true) : (
                  <div className="border border-dashed border-border bg-background/40 p-8 text-center text-xs text-muted-foreground">
                    {t("sweep_engage.request_matches.no_matches_yet")}
                  </div>
                )}
              </section>

              <section className="border border-racing-yellow/40 bg-racing-yellow/5 p-4">
                <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-b border-racing-yellow/30 pb-3">
                  <div className="min-w-0">
                    <div className="label-mono truncate text-racing-yellow">[{t("pool.column_partial")}]</div>
                    <h2 className="text-2xl font-black uppercase italic tracking-tighter text-racing-yellow">{t("pool.column_partial")}</h2>
                  </div>
                  <div className="shrink-0 font-mono text-[11px] uppercase text-racing-yellow">{partialItems.length}</div>
                </div>
                {partialItems.length > 0 ? renderPool(t("pool.column_partial"), "partial", data.tiers_partial ?? [], partialItems, true) : (
                  <div className="border border-dashed border-racing-yellow/40 bg-background/40 p-8 text-center text-xs text-muted-foreground">
                    {t("sweep_engage.request_matches.no_matches_yet")}
                  </div>
                )}
              </section>
            </div>
              </>
            )}
          </>

        )}
      </div>
      <SiteFooter />
    </div>
  );
}



type RefundState = {
  state: "zero_match" | "partial_only" | "full" | "low_relevance" | "non_refundable";
  spent: number;
  refund_pct: number;
  best_refund: number;
  refund_kind: "full" | "partial" | "low_relevance" | null;
  refund_available: boolean;
  non_refundable: boolean;
  reason: string | null;
};

/**
 * Economic options for an active Pit Call. Every amount, eligibility rule and
 * refund kind comes from the server state machine — nothing is re-derived here.
 */
function EconomicPanel({
  state,
  onWait,
  onClose,
  loading,
}: {
  state: RefundState;
  onWait: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();

  if (state.non_refundable) {
    return (
      <div className="mt-6 border border-border bg-card p-4 text-xs text-muted-foreground">
        <span className="label-mono">{t("sweep_engage.request_matches.econ_post_identical_title")}</span>
        <p className="mt-2">{t("sweep_engage.request_matches.econ_post_identical_body")}</p>
      </div>
    );
  }

  if (!state.refund_available) {
    if (state.reason === "already_refunded") {
      return (
        <div className="mt-6 border border-racing-yellow/50 bg-racing-yellow/5 p-4 text-xs text-racing-yellow">
          <span className="font-mono uppercase tracking-widest">{t("sweep_engage.request_matches.econ_refunded_title")}</span>
        </div>
      );
    }
    return null;
  }

  const isPartial = state.refund_kind === "partial";
  const isLowRel = state.refund_kind === "low_relevance";
  const title = isPartial
    ? t("sweep_engage.request_matches.econ_partial_title")
    : isLowRel
      ? t("sweep_engage.request_matches.econ_lowrel_title")
      : t("sweep_engage.request_matches.econ_zero_title");
  const body = isPartial
    ? t("sweep_engage.request_matches.econ_partial_body", { tokens: state.best_refund })
    : isLowRel
      ? t("sweep_engage.request_matches.econ_lowrel_body", { tokens: state.best_refund })
      : t("sweep_engage.request_matches.econ_zero_body", { tokens: state.best_refund });

  return (
    <div className="mt-6 border-2 border-racing-red bg-racing-red/5 p-5">
      <div className="label-mono text-racing-red">{title}</div>
      <p className="mt-2 text-xs text-muted-foreground">{body}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="flex flex-col border border-border bg-card p-4">
          <div className="text-lg font-black uppercase italic">{t("sweep_engage.request_matches.econ_continue_title")}</div>
          <div className="mt-2 border-l-2 border-racing-yellow bg-racing-yellow/10 px-3 py-2">
            <div className="label-mono text-racing-yellow">{t("sweep_engage.request_matches.econ_continue_active_title")}</div>
            <p className="mt-1 text-xs text-foreground">{t("sweep_engage.request_matches.econ_continue_active_body")}</p>
          </div>
          <p className="mt-2 flex-1 text-xs text-muted-foreground">{t("sweep_engage.request_matches.econ_continue_body")}</p>
          <button
            onClick={onWait}
            className="mt-3 border border-racing-yellow px-3 py-2 text-xs font-bold uppercase tracking-widest text-racing-yellow hover:bg-racing-yellow/10"
          >
            {t("sweep_engage.request_matches.econ_continue_button")}
          </button>
        </div>
        <div className="flex flex-col border border-border bg-card p-4">
          <div className="text-lg font-black uppercase italic">
            {isPartial
              ? t("sweep_engage.request_matches.econ_close_partial_title")
              : t("sweep_engage.request_matches.econ_close_title")}
          </div>
          <p className="mt-1 flex-1 text-xs text-muted-foreground">
            {t("sweep_engage.request_matches.econ_close_body", { tokens: state.best_refund })}
          </p>
          <button
            onClick={onClose}
            disabled={loading}
            className="mt-3 bg-racing-red px-3 py-2 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-40"
          >
            {isPartial
              ? t("sweep_engage.request_matches.econ_close_partial_button", { tokens: state.best_refund })
              : t("sweep_engage.request_matches.econ_close_button", { tokens: state.best_refund })}
          </button>
        </div>
      </div>
    </div>
  );
}
