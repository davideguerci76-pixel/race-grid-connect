import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { RatingIcons } from "@/components/rating-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock, Unlock, Mail, Phone, Star, ArrowLeft, AlertTriangle, EyeOff, Clock, Flame } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getRequestMatches, unlockMatch, requestMatchConfirmation, unlockRequestTier, triggerSosCall, refundAndCloseRequest } from "@/lib/paddock.functions";
import { disciplineLabel, initialsFor } from "@/lib/paddock";
import { levelLabel, parseSubRoles, roleGroupLabel, subRoleLabel } from "@/lib/roles";
import { CalendarQuickButtons, ContactQuickButtons } from "@/components/match-quick-actions";
import { BackButton } from "@/components/back-button";
import { PoolBadge } from "@/components/pool-badge";

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


  const unlockMut = useMutation({
    mutationFn: (match_id: string) => unlockFn({ data: { match_id } }),
    onSuccess: (r) => {
      toast.success(t("sweep_engage.request_matches.unlock_success", { balance: r.balance }));
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["token-balance"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_engage.request_matches.unlock_failed")),
  });

  const tierMut = useMutation({
    mutationFn: (args: { tier: number; scope: "full" | "partial" }) =>
      unlockTierFn({ data: { request_id: id, tier: args.tier, scope: args.scope } }),
    onSuccess: (r) => {
      toast.success(t("sweep_engage.request_matches.tier_unlock_success", { tier: r.tier, scope: r.scope, spent: r.tokens_spent, balance: r.balance }));
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["token-balance"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_engage.request_matches.tier_unlock_failed")),
  });

  const confirmFn = useServerFn(requestMatchConfirmation);
  const confirmMut = useMutation({
    mutationFn: (match_id: string) => confirmFn({ data: { match_id } }),
    onSuccess: () => {
      toast.success(t("sweep_engage.request_matches.confirmation_sent"));
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["engagements"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_engage.common.failed")),
  });

  const sosFn = useServerFn(triggerSosCall);
  const sosMut = useMutation({
    mutationFn: () => sosFn({ data: { request_id: id } }),
    onSuccess: (r: any) => {
      toast.success(t("sweep_engage.request_matches.sos_sent", { count: r?.target_count ?? 0, pct: r?.min_pct ?? 75 }));
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_engage.request_matches.sos_failed")),
  });

  const refundFn = useServerFn(refundAndCloseRequest);
  const refundMut = useMutation({
    mutationFn: (mode: "full" | "partial") => refundFn({ data: { request_id: id, mode } }),
    onSuccess: (r: any) => {
      toast.success(t("sweep_engage.request_matches.refund_credited", { tokens: r?.refund_tokens ?? 0, pct: r?.refund_pct ?? 0 }));
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["token-balance"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_engage.request_matches.refund_failed")),
  });

  const requestFilled = data?.request?.status === "filled" || data?.request?.status === "completed";
  const isFirstDayToday = data?.request?.start_date ? new Date().toISOString().slice(0, 10) === data.request.start_date : false;
  const sosEligible = Boolean(data?.request && !requestFilled && isFirstDayToday && data.request.duration !== "full_season");
  const isPoolRequest = (data?.request as any)?.search_mode === "pool";
  const fullItems = Array.isArray(data?.items) ? data.items : [];
  const partialItems = Array.isArray(data?.items_partial) ? data.items_partial : [];
  const hasAnyMatches = fullItems.length + partialItems.length > 0 || Number(data?.total_matches ?? 0) + Number(data?.total_partial_matches ?? 0) > 0;
  const outsidePoolCount = Number((data as any)?.outside_pool_count ?? 0);
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
    onError: (e: any) => toast.error(e?.message ?? t("pool.upgrade_failed")),
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
                      onClick={() => {
                        const msg = tierInfo.proportional
                          ? t("sweep_engage.request_matches.unlock_tier_confirm_reduced", { label: label.toLowerCase(), tier: tierInfo.tier, cost: tierInfo.entry_cost ?? 0, full: tierInfo.entry_cost_full ?? 0, count: tierInfo.real_count ?? 0 })
                          : t("sweep_engage.request_matches.unlock_tier_confirm", { label: label.toLowerCase(), tier: tierInfo.tier, cost: tierInfo.entry_cost ?? 0, count: tierInfo.real_count ?? 0 });
                        if (confirm(msg)) tierMut.mutate({ tier: tierInfo.tier, scope });
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
                      onConfirm={() => {
                        if (confirm(t("sweep_engage.request_matches.confirm_match_prompt"))) {
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
            <div className="border border-border bg-card p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="label-mono">[PIT CALL]</div>
                {isPoolRequest && <PoolBadge />}
              </div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">{data.request.title}</h1>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {data.request.sub_role ? `${subRoleLabel(data.request.sub_role)} (${levelLabel(data.request.sub_role_min_level ?? "junior")}+)` : roleGroupLabel(data.request.role_group)} · {disciplineLabel(data.request.discipline)} · {data.request.start_date} → {data.request.end_date}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
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
                    onClick={() => {
                      if (confirm(t("sweep_engage.request_matches.sos_confirm"))) {
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

            {/* Trivio: zero total matches, still active, no refund yet */}
            {!hasAnyMatches && !requestFilled && !(data.request as any).partial_refund_taken && (
              <ZeroMatchTrivio
                quote={(data as any).refund_quote}
                hasPartials={data.total_partial_matches > 0}
                onWait={() => toast.info(t("sweep_engage.request_matches.search_stays_active"))}
                onRefund={() => {
                  const q = (data as any).refund_quote;
                  if (confirm(t("sweep_engage.request_matches.refund_close_confirm", { full: q.refund_full, pct: q.refund_pct, spent: q.spent }))) {
                    refundMut.mutate("full");
                  }
                }}
                onPartial={() => {
                  const q = (data as any).refund_quote;
                  if (confirm(t("sweep_engage.request_matches.refund_partial_confirm", { partial: q.refund_partial }))) {
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

            {isPoolRequest && outsidePoolCount > 0 && (
              <div className="mt-6 flex flex-wrap items-start justify-between gap-4 border-2 border-racing-yellow bg-racing-yellow/5 p-5">
                <div className="min-w-0">
                  <div className="label-mono text-racing-yellow">[{t("pool.upgrade_label")}]</div>
                  <p className="mt-1 text-sm">
                    {t("pool.upgrade_desc", { count: outsidePoolCount })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("pool.upgrade_hint", { cost: upgradeCost })}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (confirm(t("pool.upgrade_confirm", { cost: upgradeCost, count: outsidePoolCount }))) {
                      upgradeMut.mutate();
                    }
                  }}
                  disabled={upgradeMut.isPending}
                  className="bg-racing-yellow px-4 py-3 text-xs font-bold uppercase tracking-widest text-carbon hover:brightness-110 disabled:opacity-60"
                >
                  {t("pool.upgrade_button", { cost: upgradeCost })}
                </button>
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

function MatchCard({ match, onUnlock, onConfirm, loading, requestFilled, perProfileCost }: { match: any; onUnlock: () => void; onConfirm: () => void; loading: boolean; requestFilled: boolean; perProfileCost: number }) {
  const { t } = useTranslation();
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
  const showIdentity = typeof profile?.display_name === "string" && profile.display_name.trim().length > 0;
  const phoneLabel = [profile?.phone_dial_code, profile?.phone_number].filter(Boolean).join(" ").trim();
  const telHref = [profile?.phone_dial_code, profile?.phone_number].filter(Boolean).join("").replace(/\s+/g, "");
  const gapLabel = edgeOnly ? t("sweep_engage.request_matches.gap_edge_only") : t("sweep_engage.request_matches.gap_central");
  const partialBorder = edgeOnly ? "border-racing-yellow/60 bg-racing-yellow/5" : "border-racing-red/60 bg-racing-red/5";
  const gapBadge = edgeOnly
    ? "border-racing-yellow/60 bg-racing-yellow/10 text-racing-yellow"
    : "border-racing-red/60 bg-racing-red/10 text-racing-red";
  const gapDot = edgeOnly ? "bg-racing-yellow" : "bg-racing-red";

  return (
    <div className={`border p-5 ${perfect ? "border-racing-yellow bg-racing-yellow/5" : isPartial ? partialBorder : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {match?.unlocked ? <Unlock className="size-4 text-racing-yellow" /> : <Lock className="size-4 text-muted-foreground" />}
          <div>
            <div className={`text-3xl font-black italic tracking-tighter ${perfect ? "text-racing-yellow" : "text-racing-red"}`}>
              {pct}% <span className="text-sm font-mono uppercase tracking-widest">{perfect ? t("sweep_engage.request_matches.perfect_match_short") : t("sweep_engage.request_matches.skills_affinity")}</span>
            </div>
            {match?.in_pool && <div className="mb-1"><PoolBadge /></div>}
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {t("sweep_engage.request_matches.rank_tier_overlap", { rank: match?.rank ?? "—", tier: match?.tier ?? "—", count: match?.overlap_days ?? 0 })}
              {match?.top_three && <span className="ml-2 text-racing-yellow">· {t("sweep_engage.request_matches.top3_free")}</span>}
              {match?.free_preview && !match?.top_three && match?.unlocked && <span className="ml-2 text-racing-yellow">· {t("sweep_engage.request_matches.unlocked_tag")}</span>}
            </div>
            {isPartial && (
              <div className="mt-2 space-y-2">
                <div className={`inline-flex items-center gap-2 border ${gapBadge} px-2 py-1 font-mono text-[10px] uppercase tracking-widest`} title={gapLabel}>
                  <span className={`inline-block size-2 rounded-full ${gapDot}`} />
                  <Clock className="size-3" /> {t("sweep_engage.request_matches.missing_days_badge", { count: match?.missing_days ?? 0 })} · {gapLabel}
                </div>
                {missingDates.length > 0 && (
                  <div className="border border-racing-yellow/50 bg-background/60 p-2 font-mono text-[10px] uppercase tracking-widest text-racing-yellow">
                    <div className="mb-1">{t(missingDates.length === 1 ? "sweep_engage.request_matches.missing_dates_one" : "sweep_engage.request_matches.missing_dates_many")}</div>
                    <div className="flex flex-wrap gap-1">
                      {missingDates.map((day: string) => (
                        <time key={day} dateTime={day} className="border border-racing-yellow/40 bg-racing-yellow/10 px-2 py-0.5">
                          {day}
                        </time>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {match?.rating && match.rating.count > 0 && (
              <div className="mt-1">
                <RatingIcons variant="wrench" value={match.rating.average} count={match.rating.count} size={14} />
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {blurred && (
            <button
              onClick={onUnlock}
              disabled={loading}
              className="flex items-center gap-2 bg-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
            >
              <Unlock className="size-3" /> {t("sweep_engage.request_matches.unlock_details_button", { cost: perProfileCost })}
            </button>
          )}
          {match?.unlocked && !requestFilled && (
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex items-center gap-2 bg-racing-yellow px-4 py-2 text-xs font-bold uppercase tracking-widest text-carbon hover:brightness-110 disabled:opacity-60"
            >
              {t("sweep_engage.request_matches.request_confirmation_button")}
            </button>
          )}
          {requestFilled && (
            <span className="border border-racing-yellow bg-racing-yellow/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-racing-yellow">
              {t("sweep_engage.request_matches.match_already_assigned")}
            </span>
          )}
        </div>
      </div>

      {match?.unlocked && profile ? (
        <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center border border-border bg-secondary font-black uppercase text-muted-foreground">
                {showIdentity ? initialsFor(profile.display_name) : <Lock className="size-4" />}
              </div>
              <div>
                <div className={showIdentity ? "text-lg font-bold" : "text-lg font-bold text-muted-foreground"}>
                  {showIdentity ? profile.display_name : t("sweep_engage.request_matches.hidden_freelancer")}
                </div>
                {profile.role_group && <div className="font-mono text-[11px] uppercase text-muted-foreground">{roleGroupLabel(profile.role_group)}{subRoles.length ? ` · ${subRoles.map((sr) => `${subRoleLabel(sr.sub_role)} (${levelLabel(sr.level)})`).join(", ")}` : ""}</div>}
              </div>
            </div>
            {profile.headline && <p className="mt-3 text-sm">{profile.headline}</p>}
            {profile.bio && <p className="mt-2 text-xs text-muted-foreground">{profile.bio}</p>}
            <div className="mt-3 space-y-1 font-mono text-[11px] uppercase text-muted-foreground">
              {profile.location && <div>📍 {profile.location}</div>}
              {profile.day_rate != null && <div>{t("sweep_engage.request_matches.day_rate_per_day", { rate: profile.day_rate })}</div>}
              <div>{t("sweep_engage.request_matches.travels_line", { answer: profile.travels ? t("sweep_engage.matches.yes") : t("sweep_engage.matches.no") })}</div>
            </div>
          </div>
          <div>
            <div className="label-mono mb-1">[CONTACT]</div>
            {profile.contact_email || profile.phone_number ? (
              <div className="grid gap-1 border border-racing-yellow/40 bg-racing-yellow/5 p-3 font-mono text-xs">
                {profile.contact_email && <a href={`mailto:${profile.contact_email}`} className="break-all text-racing-red hover:underline">{profile.contact_email}</a>}
                {profile.phone_number && <a href={`tel:${telHref}`} className="text-racing-red hover:underline">{phoneLabel || profile.phone_number}</a>}
              </div>
            ) : (
              <div className="rounded border border-border bg-background/50 p-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("sweep_engage.matches.name_contacts_hidden")}
              </div>
            )}
            {disciplines.length > 0 && (
              <>
                <div className="label-mono mb-1 mt-3">[DISCIPLINES]</div>
                <div className="flex flex-wrap gap-1">
                  {disciplines.map((d: string) => (
                    <span key={d} className="border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase">{disciplineLabel(d)}</span>
                  ))}
                </div>
              </>
            )}
            {skills.length > 0 && (
              <>
                <div className="label-mono mb-1 mt-3">[SKILLS]</div>
                <div className="flex flex-wrap gap-1">
                  {skills.map((s: string) => (
                    <span key={s} className="border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase">{s}</span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="md:col-span-2 border-t border-border pt-4">
            <div className="label-mono mb-2 flex items-center gap-2"><Star className="size-3 text-racing-yellow" /> {missingCriteria.length === 0 ? t("sweep_engage.matches.criteria") : t("sweep_engage.matches.missing_criteria")}</div>
            {missingCriteria.length === 0 ? (
              <div className="font-mono text-[11px] text-racing-yellow">{t("sweep_engage.request_matches.all_criteria_satisfied_100")}</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {missingCriteria.map((c: any, i: number) => (
                  <span key={i} className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${c.hard ? "border-racing-red text-racing-red" : "border-border text-muted-foreground"}`}>
                    {formatCriterion(c, t)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 border-t border-border pt-4">
          <div className="label-mono mb-2 flex items-center gap-2"><Star className="size-3 text-racing-yellow" /> {t("sweep_engage.matches.missing_criteria")}</div>
            {missingCriteria.length === 0 ? (
            <div className="font-mono text-[11px] text-racing-yellow">{t("sweep_engage.request_matches.all_criteria_satisfied_100")}</div>
          ) : (
            <div className="flex flex-wrap gap-1">
                {missingCriteria.map((c: any, i: number) => (
                <span key={i} className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${c.hard ? "border-racing-red text-racing-red" : "border-border text-muted-foreground"}`}>
                  {formatCriterion(c, t)}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 rounded border border-border bg-background/50 p-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("sweep_engage.request_matches.tech_details_hidden_note", { cost: perProfileCost })}
          </div>
        </div>
      )}
    </div>
  );
}

function formatCriterion(c: any, t: (k: string, o?: any) => string): string {
  switch (c.kind) {
    case "role": return t("sweep_engage.criteria.role", { label: c.label ?? "" });
    case "skill": return t("sweep_engage.criteria.skill", { label: c.label });
    case "language": return t("sweep_engage.criteria.language", { code: c.code, level: c.level });
    case "education": return t("sweep_engage.criteria.education");
    case "day_rate": return t("sweep_engage.criteria.day_rate");
    case "location": return t("sweep_engage.criteria.location", { label: c.label ?? t("sweep_engage.criteria.distant") });
    case "missing_days": return t("sweep_engage.criteria.missing_days", { count: c.days });
    default: return c.kind ?? t("sweep_engage.criteria.criterion");
  }
}

function ZeroMatchTrivio({
  quote,
  hasPartials,
  onWait,
  onRefund,
  onPartial,
  loading,
}: {
  quote: { spent: number; hard_count: number; min_pct: number; drop_pct: number; refund_pct: number; refund_full: number; refund_partial: number };
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
        {" "}{t("sweep_engage.request_matches.refund_quote_basis", { hard: quote.hard_count, min: quote.min_pct, drop: quote.drop_pct })}
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
