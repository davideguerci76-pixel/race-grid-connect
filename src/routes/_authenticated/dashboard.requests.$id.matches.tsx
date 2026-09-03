import { confirmDialog } from "@/hooks/use-confirm";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RatingIcons } from "@/components/rating-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock, Unlock, Mail, Phone, ArrowLeft, AlertTriangle, EyeOff, Clock, Flame, Pencil, Play, Ban } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getRequestMatches, unlockMatch, requestMatchConfirmation, unlockRequestTier, triggerSosCall, refundAndCloseRequest, upgradeRequestToStandard, activateRequestNow, redCancelRequest } from "@/lib/paddock.functions";
import { disciplineLabel, educationLabel, skillLabel } from "@/lib/paddock";
import { formatCriterion } from "@/lib/criteria-label";
import { levelLabel, parseSubRoles, roleGroupLabel, subRoleLabel } from "@/lib/roles";
import { CalendarQuickButtons, ContactQuickButtons } from "@/components/match-quick-actions";
import { BackButton } from "@/components/back-button";
import { PoolBadge } from "@/components/pool-badge";
import { PitCallSummary } from "@/components/pitcall-summary";

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
  const partialRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["request-matches", id],
    queryFn: () => fetchMatches({ data: { request_id: id } }),
    retry: false,
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
      toast.success(t("sweep_engage.request_matches.sos_sent", { count: r?.target_count ?? 0, pct: r?.min_pct ?? 75 }));
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
  const isFirstDayToday = data?.request?.start_date ? new Date().toISOString().slice(0, 10) === data.request.start_date : false;
  const sosEligible = Boolean(data?.request && !requestFilled && !inReview && isFirstDayToday && data.request.duration !== "full_season");
  const isPoolRequest = (data?.request as any)?.search_mode === "pool";
  const fullItems = Array.isArray(data?.items) ? data.items : [];
  const partialItems = Array.isArray(data?.items_partial) ? data.items_partial : [];
  const hasAnyMatches =
    fullItems.length + partialItems.length > 0 ||
    Number(data?.total_matches ?? 0) + Number(data?.total_partial_matches ?? 0) > 0 ||
    Boolean((data?.request as any)?.ever_full_matched) ||
    Boolean((data?.request as any)?.ever_partial_matched);
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
                    <TierPlaceholder key={i} rank={(tierInfo.tier === 2 ? 11 : 11 + ((Array.isArray(tiers) ? tiers : []).find((x) => x?.tier === 2)?.size ?? 10)) + i} />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3">
                  {tierItems.map((m) => (
                    <MatchCard
                      key={m.match_id}
                      match={m}
                      perProfileCost={data!.per_profile_cost}
                      requestFilled={!!requestFilled}
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
                      {state.red_cancel_eligible && (
                        <button onClick={async () => { if (await confirmDialog(t("sweep_engage.request_matches.red_cancel_confirm"))) redCancelMut.mutate(); }} disabled={redCancelMut.isPending} className="inline-flex items-center gap-2 border border-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10 disabled:opacity-60">
                          <Ban className="size-3" /> {t("sweep_engage.request_matches.red_cancel_button")}
                        </button>
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

              {sosEligible && (
                <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-2 border-racing-red bg-racing-red/10 p-4">
                  <div className="min-w-0">
                    <div className="label-mono text-racing-red">[SOS CALL — FIRST DAY ONLY]</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("sweep_engage.request_matches.sos_description")}
                    </p>
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


            {data.hired && (
              <div className="mt-6 border-2 border-racing-yellow bg-racing-yellow/5 p-5">
                <div className="label-mono text-racing-yellow">[CONFIRMED MATCH]</div>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex size-14 items-center justify-center border border-racing-yellow bg-secondary font-black uppercase">
                      {data.hired.display_name?.slice(0, 2) ?? "?"}
                    </div>
                    <div>
                      <div className="text-2xl font-black italic tracking-tighter">{data.hired.display_name}</div>
                      {data.hired.headline && <div className="text-sm text-muted-foreground">{data.hired.headline}</div>}
                      <div className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
                        {data.hired.role_group && <>{roleGroupLabel(data.hired.role_group)}</>}
                        {data.hired.location && <> · 📍 {data.hired.location}</>}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-[240px] space-y-1 font-mono text-xs">
                    <div className="label-mono">[CONTACT]</div>
                    {data.hired.contact_email ? (
                      <a href={`mailto:${data.hired.contact_email}`} className="flex items-center gap-2 text-racing-red hover:underline">
                        <Mail className="size-3" /> {data.hired.contact_email}
                      </a>
                    ) : <div className="text-muted-foreground">{t("sweep_engage.request_matches.no_email_on_file")}</div>}
                    {data.hired.phone_number ? (
                      <a href={`tel:${(data.hired.phone_dial_code ?? "")}${data.hired.phone_number}`} className="flex items-center gap-2 text-racing-red hover:underline">
                        <Phone className="size-3" /> {data.hired.phone_dial_code} {data.hired.phone_number}
                      </a>
                    ) : <div className="text-muted-foreground">{t("sweep_engage.request_matches.no_phone_on_file")}</div>}
                  </div>
                </div>

                <div className="mt-4 border-t border-racing-yellow/30 pt-4">
                  <div className="label-mono mb-2 text-racing-yellow">[QUICK ACTIONS]</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("sweep_engage.request_matches.add_match_dates_to_calendar")}</div>
                      <CalendarQuickButtons
                        event={{
                          title: `Match — ${data.request.title}`,
                          startDate: data.request.start_date,
                          endDate: data.request.end_date,
                          location: data.request.location ?? data.request.circuit ?? null,
                          description: `${roleGroupLabel(data.request.role_group)}${data.request.sub_role ? ` · ${subRoleLabel(data.request.sub_role)}` : ""} · ${disciplineLabel(data.request.discipline)}\nFreelancer: ${data.hired.display_name ?? ""}${data.hired.contact_email ? `\nEmail: ${data.hired.contact_email}` : ""}${data.hired.phone_number ? `\nPhone: ${data.hired.phone_dial_code ?? ""} ${data.hired.phone_number}` : ""}`,
                        }}
                      />
                    </div>
                    <div>
                      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("sweep_engage.request_matches.save_freelancer_contact")}</div>
                      <ContactQuickButtons
                        contact={{
                          fullName: data.hired.display_name ?? t("sweep_engage.matches.freelancer_fallback"),
                          email: data.hired.contact_email ?? null,
                          phone: data.hired.phone_number ? `${data.hired.phone_dial_code ?? ""}${data.hired.phone_number}`.replace(/\s+/g, "") : null,
                          title: data.hired.role_group ? roleGroupLabel(data.hired.role_group) : null,
                          notes: t("sweep_engage.request_matches.pitcall_match_confirmed_note", { title: data.request.title }),
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Trivio: no match left to confirm (zero matches, or all declined/expired) */}
            {(!hasAnyMatches || Number((data as any).confirmable_left ?? 1) === 0) && !requestFilled && !(data.request as any).partial_refund_taken && (
              <ZeroMatchTrivio
                quote={(data as any).refund_quote}
                hasPartials={data.total_partial_matches > 0}
                onWait={() => toast.info(t("sweep_engage.request_matches.search_stays_active"))}
                onRefund={async () => {
                  const q = (data as any).refund_quote;
                  if (await confirmDialog(t("sweep_engage.request_matches.refund_close_confirm", { full: q.refund_full, pct: q.refund_pct, spent: q.spent }))) {
                    refundMut.mutate("full");
                  }
                }}
                onPartial={async () => {
                  const q = (data as any).refund_quote;
                  if (await confirmDialog(t("sweep_engage.request_matches.refund_partial_confirm", { partial: q.refund_partial }))) {
                    refundMut.mutate("partial");
                  }
                }}
                loading={refundMut.isPending}
              />
            )}

            {(data.request as any).partial_refund_taken && (data.request as any).refund_kind === "partial" && (
              <div className="mt-6 border border-racing-yellow/50 bg-racing-yellow/5 p-4 text-xs text-racing-yellow">
                <span className="font-mono uppercase tracking-widest">[PARTIAL REFUND COLLECTED]</span>{" "}
                <span className="ml-2">{t("sweep_engage.request_matches.partial_refund_credited", { tokens: (data.request as any).refund_tokens, pct: (data.request as any).refund_pct })}</span>
              </div>
            )}

            {isPoolRequest && expandAvailable && (
              <div className="mt-6 border-2 border-racing-yellow bg-racing-yellow/5 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="label-mono text-racing-yellow">{t("pool.upgrade_label")}</div>
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

            {/* FOMO banner */}
            {data.partial_banner && (
              <div className="mt-8 border-2 border-racing-red bg-racing-red/5 p-5">
                <div className="flex items-start gap-3">
                  <Flame className="mt-1 size-5 shrink-0 text-racing-red" />
                  <div className="flex-1">
                    <div className="label-mono text-racing-red">[PARTIAL MATCHES AVAILABLE]</div>
                    <p className="mt-1 text-sm">
                      {data.partial_banner.case === "A" ? (
                        <>
                          {t("sweep_engage.request_matches.partial_banner_case_a_1")} <span className="font-black text-racing-yellow">{data.partial_banner.best_full_skill}%</span>{t("sweep_engage.request_matches.partial_banner_case_a_2")} <span className="font-black text-racing-yellow">{data.partial_banner.best_partial_skill}%</span>{t("sweep_engage.request_matches.partial_banner_case_a_3")}
                        </>
                      ) : (
                        <>{t("sweep_engage.request_matches.partial_banner_case_b")}</>
                      )}
                    </p>
                    <button
                      onClick={() => partialRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="mt-3 bg-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110"
                    >
                      {t("sweep_engage.request_matches.view_partial_matches_button", { count: data.partial_banner.partial_count })}
                    </button>
                  </div>
                </div>
              </div>
            )}

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

              <section ref={partialRef} className="border border-racing-yellow/40 bg-racing-yellow/5 p-4">
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

function TierPlaceholder({ rank }: { rank: number }) {
  const { t } = useTranslation();
  return (
    <div className="relative overflow-hidden border border-dashed border-border bg-card p-5">
      <div className="pointer-events-none select-none blur-md">
        <div className="text-3xl font-black italic tracking-tighter text-muted-foreground">??% Match</div>
        <div className="mt-2 h-4 w-40 bg-secondary" />
        <div className="mt-2 h-3 w-64 bg-secondary" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-2 border border-border bg-background/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur">
          <EyeOff className="size-3" /> {t("sweep_engage.request_matches.rank_tier_locked", { rank })}
        </div>
      </div>
    </div>
  );
}

function Chip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "hard" }) {
  return (
    <span
      className={`rounded-md border px-2.5 py-1 text-[13px] leading-none ${
        tone === "hard"
          ? "border-racing-red/70 bg-racing-red/10 font-semibold text-racing-red"
          : "border-border bg-secondary text-foreground"
      }`}
    >
      {children}
    </span>
  );
}

function DetailBlock({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "@xl:col-span-2" : ""}>
      <h4 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function MatchCard({ match, onUnlock, onConfirm, loading, requestFilled, perProfileCost }: { match: any; onUnlock: () => void; onConfirm: () => void; loading: boolean; requestFilled: boolean; perProfileCost: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const pct = Math.round(Number(match?.skills_score ?? match?.match_score ?? 0));
  const perfect = !!match?.is_perfect;
  const blurred = !!match?.blurred;
  const isPartial = !!match?.is_partial;
  const edgeOnly = match?.edge_only !== false;
  const profile = match?.profile ?? null;
  const missingCriteria = Array.isArray(match?.missing_criteria) ? match.missing_criteria : [];
  const missingDates = Array.isArray(match?.missing_dates) ? match.missing_dates.filter((d: unknown) => typeof d === "string") : [];
  const subRoles = parseSubRoles(profile?.sub_roles);
  const disciplines = Array.isArray(profile?.disciplines) ? profile.disciplines : [];
  const skills = Array.isArray(profile?.skills) ? profile.skills : [];
  const languages = Array.isArray(profile?.languages) ? profile.languages : [];
  const experiences = Array.isArray(profile?.experiences) ? profile.experiences : [];
  const showIdentity = typeof profile?.display_name === "string" && profile.display_name.trim().length > 0;
  const phoneLabel = [profile?.phone_dial_code, profile?.phone_number].filter(Boolean).join(" ").trim();
  const telHref = [profile?.phone_dial_code, profile?.phone_number].filter(Boolean).join("").replace(/\s+/g, "");
  const gapLabel = edgeOnly ? t("sweep_engage.request_matches.gap_edge_only") : t("sweep_engage.request_matches.gap_central");

  const hardMissing = missingCriteria.filter((c: any) => c?.hard);
  const softMissing = missingCriteria.filter((c: any) => !c?.hard);

  const scoreColor = perfect ? "text-racing-yellow" : isPartial ? "text-racing-red" : "text-foreground";
  const labelColor = perfect ? "text-racing-yellow" : isPartial ? "text-racing-red" : "text-success";
  const stateLabel = perfect
    ? t("mcard.label_perfect")
    : isPartial
      ? t("mcard.label_partial")
      : t("mcard.label_full");
  const cardBorder = perfect
    ? "border-racing-yellow/55 bg-racing-yellow/5"
    : isPartial
      ? (edgeOnly ? "border-racing-yellow/50 bg-racing-yellow/5" : "border-racing-red/55 bg-racing-red/5")
      : open
        ? "border-racing-red/50 bg-card"
        : "border-border bg-card";

  const facts: React.ReactNode[] = [];
  if (profile?.location) facts.push(<span key="loc">{profile.location}</span>);
  if (profile?.day_rate != null) facts.push(<span key="rate">{t("sweep_engage.request_matches.day_rate_per_day", { rate: profile.day_rate })}</span>);
  facts.push(<span key="days">{t("mcard.days_available", { count: match?.overlap_days ?? 0 })}</span>);
  if (profile) {
    facts.push(
      <span key="travel">
        {t("mcard.travels")}: <b className="font-semibold">{profile.travels ? t("mcard.yes") : t("mcard.no")}</b>
      </span>,
    );
  }
  if (match?.rating && match.rating.count > 0) {
    facts.push(
      <span key="rating" className="inline-flex items-center gap-1.5">
        <span className="text-muted-foreground">{t("mcard.rating")}</span>
        <RatingIcons variant="wrench" value={match.rating.average} count={match.rating.count} size={14} />
      </span>,
    );
  }

  return (
    <div className="@container">
      <div className={`rounded-2xl border p-5 @lg:p-6 ${cardBorder}`}>
        {/* TOP ROW: score block (left) + CTA (right) */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className={`text-[46px] font-black leading-none tracking-tighter @lg:text-[54px] ${scoreColor}`}>{pct}%</div>
            <div className="mt-1.5">
              <div className={`font-mono text-[11px] font-bold uppercase tracking-[0.16em] ${labelColor}`}>{stateLabel}</div>
              <div className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {t("sweep_engage.request_matches.rank_tier_overlap", { rank: match?.rank ?? "—", tier: match?.tier ?? "—", count: match?.overlap_days ?? 0 })}
              </div>
              {match?.top_three && <div className="mt-1 font-mono text-[11px] uppercase tracking-widest text-racing-yellow">{t("sweep_engage.request_matches.top3_free")}</div>}
              {match?.free_preview && !match?.top_three && match?.unlocked && (
                <div className="mt-1 font-mono text-[11px] uppercase tracking-widest text-racing-yellow">{t("sweep_engage.request_matches.unlocked_tag")}</div>
              )}
            </div>
          </div>

          {/* CTA */}
          <div className="flex shrink-0 flex-col items-stretch gap-2.5">
            {blurred && (
              <button
                onClick={onUnlock}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-[14px] font-bold text-foreground transition-colors hover:border-racing-red disabled:opacity-60"
              >
                <Unlock className="size-3.5" /> {t("sweep_engage.request_matches.unlock_details_button", { cost: perProfileCost })}
              </button>
            )}
            {match?.unlocked && !requestFilled && (
              match?.confirmation_requested ? (
                <span className="rounded-xl border border-racing-yellow bg-racing-yellow/10 px-4 py-3 text-center font-mono text-[11px] uppercase tracking-widest text-racing-yellow">
                  {t("mcard.confirmation_requested")}
                </span>
              ) : (
                <button
                  onClick={onConfirm}
                  disabled={loading}
                  className="rounded-xl bg-racing-red px-4 py-3 text-[14px] font-extrabold text-white hover:brightness-110 disabled:opacity-60"
                >
                  {t("sweep_engage.request_matches.request_confirmation_button")}
                </button>
              )
            )}
            {requestFilled && (
              <span className="rounded-xl border border-racing-yellow bg-racing-yellow/10 px-3 py-2.5 text-center font-mono text-[11px] uppercase tracking-widest text-racing-yellow">
                {t("sweep_engage.request_matches.match_already_assigned")}
              </span>
            )}
          </div>
        </div>

        {/* MAIN: full width below */}
        <div className="mt-4 min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {!match?.unlocked && <Lock className="size-4 shrink-0 text-muted-foreground" />}
              <span className={`text-[19px] font-extrabold ${showIdentity ? "" : "text-muted-foreground"}`}>
                {showIdentity ? profile.display_name : t("sweep_engage.request_matches.hidden_freelancer")}
              </span>
              {profile?.role_group && (
                <span className="text-[17px] font-bold">
                  {roleGroupLabel(profile.role_group)}
                  {subRoles.length > 0 && (
                    <span className="font-semibold text-muted-foreground">
                      {" · "}{subRoles.map((sr) => `${subRoleLabel(sr.sub_role)} (${levelLabel(sr.level)})`).join(", ")}
                    </span>
                  )}
                </span>
              )}
              {match?.in_pool && <PoolBadge />}
            </div>

            {facts.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-y-1 text-[15px]">
                {facts.map((f, i) => (
                  <span key={i} className="inline-flex items-center">
                    {i > 0 && <span className="mx-2.5 text-muted-foreground">·</span>}
                    {f}
                  </span>
                ))}
              </div>
            )}

            {/* WHY THIS SCORE */}
            <div className="mt-2.5 flex flex-col gap-1 text-[14.5px] leading-relaxed">
              {isPartial && (match?.missing_days ?? 0) > 0 && (
                <span className={edgeOnly ? "text-racing-yellow" : "text-racing-red"}>
                  <Clock className="mr-1.5 inline size-3.5" />
                  {t("mcard.missing_days_line", { count: match?.missing_days ?? 0, dates: missingDates.slice(0, 4).join(", ") || gapLabel })}
                </span>
              )}
              {hardMissing.length > 0 && (
                <span className="text-racing-red">
                  ✕ {t("mcard.hard_missing", { list: hardMissing.map((c: any) => formatCriterion(c, t)).join(", ") })}
                </span>
              )}
              {softMissing.length > 0 && (
                <span className="text-racing-yellow">
                  ◐ {t("mcard.missing_preferred", { list: softMissing.map((c: any) => formatCriterion(c, t)).join(", ") })}
                </span>
              )}
              {hardMissing.length === 0 && softMissing.length === 0 && (
                <span className="text-success">✓ {t("mcard.all_hard_met")}</span>
              )}
            </div>

            {/* EXPANDED */}
            {open && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="grid gap-5 @xl:grid-cols-2">
                  {match?.unlocked && profile ? (
                    <>
                      {(profile.headline || profile.bio) && (
                        <DetailBlock title={t("mcard.headline")} wide>
                          {profile.headline && <p className="text-[14.5px] leading-relaxed">{profile.headline}</p>}
                          {profile.bio && <p className="mt-1 text-[14.5px] leading-relaxed text-muted-foreground">{profile.bio}</p>}
                        </DetailBlock>
                      )}
                      {disciplines.length > 0 && (
                        <DetailBlock title={t("mcard.disciplines")}>
                          <div className="flex flex-wrap gap-1.5">
                            {disciplines.map((d: string) => <Chip key={d}>{disciplineLabel(d)}</Chip>)}
                          </div>
                        </DetailBlock>
                      )}
                      {skills.length > 0 && (
                        <DetailBlock title={t("mcard.skills")}>
                          <div className="flex flex-wrap gap-1.5">
                            {skills.map((s: string) => <Chip key={s}>{skillLabel(s)}</Chip>)}
                          </div>
                        </DetailBlock>
                      )}
                      {languages.length > 0 && (
                        <DetailBlock title={t("mcard.languages")}>
                          <div className="flex flex-wrap gap-1.5">
                            {languages.map((l: any, i: number) => (
                              <Chip key={i}>{typeof l === "string" ? l : `${l?.custom || l?.code || ""}${l?.level ? ` · ${l.level}` : ""}`}</Chip>
                            ))}
                          </div>
                        </DetailBlock>
                      )}
                      {(experiences.length > 0 || profile.education) && (
                        <DetailBlock title={t("mcard.exp_edu")}>
                          <div className="text-[14.5px] leading-relaxed text-muted-foreground">
                            {experiences.map((e: any, i: number) => (
                              <span key={i}>
                                {i > 0 && " · "}
                                {disciplineLabel(e?.discipline)} · {e?.years ?? 0} {t("mcard.years_short")}
                              </span>
                            ))}
                            {profile.education && <span>{experiences.length > 0 ? " · " : ""}{educationLabel(profile.education)}</span>}
                          </div>
                        </DetailBlock>
                      )}
                      <DetailBlock title={t("mcard.contact")}>
                        {profile.contact_email || profile.phone_number ? (
                          <div className="grid gap-1 text-[14.5px]">
                            {profile.contact_email && <a href={`mailto:${profile.contact_email}`} className="break-all text-racing-red hover:underline">{profile.contact_email}</a>}
                            {profile.phone_number && <a href={`tel:${telHref}`} className="text-racing-red hover:underline">{phoneLabel || profile.phone_number}</a>}
                          </div>
                        ) : (
                          <div className="text-[14.5px] text-muted-foreground">{t("sweep_engage.matches.name_contacts_hidden")}</div>
                        )}
                      </DetailBlock>
                    </>
                  ) : (
                    <DetailBlock title={t("mcard.contact")} wide>
                      <div className="text-[14.5px] leading-relaxed text-muted-foreground">
                        {t("sweep_engage.request_matches.tech_details_hidden_note", { cost: perProfileCost })}
                      </div>
                    </DetailBlock>
                  )}

                  <DetailBlock title={t("mcard.criteria")} wide>
                    <div className="flex flex-col gap-1.5 text-[14.5px]">
                      {isPartial && (match?.missing_days ?? 0) > 0 && (
                        <div className={edgeOnly ? "text-racing-yellow" : "text-racing-red"}>
                          ◐ {t("mcard.missing_days_line", { count: match?.missing_days ?? 0, dates: missingDates.join(", ") || gapLabel })}
                        </div>
                      )}
                      {hardMissing.map((c: any, i: number) => (
                        <div key={`h${i}`} className="text-racing-red">✕ {formatCriterion(c, t)}</div>
                      ))}
                      {softMissing.map((c: any, i: number) => (
                        <div key={`s${i}`} className="text-racing-yellow">◐ {formatCriterion(c, t)}</div>
                      ))}
                      {missingCriteria.length === 0 && (
                        <div className="text-success">✓ {t("sweep_engage.request_matches.all_criteria_satisfied_100")}</div>
                      )}
                    </div>
                  </DetailBlock>
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-1.5 font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-racing-red hover:text-foreground"
              >
                {open ? t("mcard.hide_details") : t("mcard.view_details")}
                <span className="text-racing-red">{open ? "↑" : "↓"}</span>
              </button>
            </div>
        </div>
      </div>
    </div>
  );
}


function ZeroMatchTrivio({
  quote,
  hasPartials,
  onWait,
  onRefund,
  onPartial,
  loading,
}: {
  quote: {
    spent: number;
    refund_pct: number;
    refund_full: number;
    refund_partial: number;
    low_relevance_eligible?: boolean;
    low_relevance_refund?: number;
  };
  hasPartials: boolean;
  onWait: () => void;
  onRefund: () => void;
  onPartial: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-6 border-2 border-racing-red bg-racing-red/5 p-5">
      <div className="label-mono text-racing-red">{t("sweep_engage.request_matches.zero_matches_title")}</div>
      <h2 className="mt-1 text-2xl font-black uppercase italic tracking-tighter">{t("sweep_engage.request_matches.zero_matches_subtitle")}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("sweep_engage.request_matches.refund_quote_line", { pct: quote.refund_pct, spent: quote.spent })}
        {" "}{t("sweep_engage.request_matches.refund_quote_equals", { full: quote.refund_full })}
        {" "}{t("sweep_engage.request_matches.refund_quote_basis")}
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="flex flex-col border border-border bg-card p-4">
          <div className="label-mono">{t("sweep_engage.request_matches.option_label", { n: 1 })}</div>
          <div className="text-lg font-black uppercase italic">{t("sweep_engage.request_matches.keep_searching_title")}</div>
          <p className="mt-1 flex-1 text-xs text-muted-foreground">
            {t("sweep_engage.request_matches.keep_searching_body")}
          </p>
          <button onClick={onWait} className="mt-3 border border-racing-yellow px-3 py-2 text-xs font-bold uppercase tracking-widest text-racing-yellow hover:bg-racing-yellow/10">
            {t("sweep_engage.request_matches.keep_waiting_button")}
          </button>
        </div>
        <div className="flex flex-col border border-border bg-card p-4">
          <div className="label-mono">{t("sweep_engage.request_matches.option_label", { n: 2 })}</div>
          <div className="text-lg font-black uppercase italic">{t("sweep_engage.request_matches.refund_close_title")}</div>
          <p className="mt-1 flex-1 text-xs text-muted-foreground">
            {t("sweep_engage.request_matches.refund_close_body", { full: quote.refund_full })}
          </p>
          <button
            onClick={onRefund}
            disabled={loading || quote.refund_full === 0}
            className="mt-3 bg-racing-red px-3 py-2 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-40"
          >
            {t("sweep_engage.request_matches.take_and_close_button", { full: quote.refund_full })}
          </button>
        </div>
        <div className={`flex flex-col border p-4 ${hasPartials ? "border-border bg-card" : "border-border/40 bg-secondary/40 opacity-60"}`}>
          <div className="label-mono">{t("sweep_engage.request_matches.option_label", { n: 3 })}</div>
          <div className="text-lg font-black uppercase italic">{t("sweep_engage.request_matches.unlock_partials_title")}</div>
          <p className="mt-1 flex-1 text-xs text-muted-foreground">
            {hasPartials
              ? t("sweep_engage.request_matches.unlock_partials_body_has", { partial: quote.refund_partial })
              : t("sweep_engage.request_matches.unlock_partials_body_none")}
          </p>
          <button
            onClick={onPartial}
            disabled={loading || !hasPartials || quote.refund_partial === 0}
            className="mt-3 border border-racing-red px-3 py-2 text-xs font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10 disabled:opacity-40"
          >
            {t("sweep_engage.request_matches.take_and_unlock_button", { partial: quote.refund_partial })}
          </button>
        </div>
      </div>
    </div>
  );
}
