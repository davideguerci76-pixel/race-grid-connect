import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useRef } from "react";
import { RatingIcons } from "@/components/rating-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock, Unlock, Mail, Phone, Star, ArrowLeft, AlertTriangle, EyeOff, Clock, Flame } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getRequestMatches, unlockMatch, requestMatchConfirmation, unlockRequestTier, triggerSosCall, refundAndCloseRequest } from "@/lib/paddock.functions";
import { disciplineLabel } from "@/lib/paddock";
import { levelLabel, parseSubRoles, roleGroupLabel, subRoleLabel } from "@/lib/roles";
import { CalendarQuickButtons, ContactQuickButtons } from "@/components/match-quick-actions";

export const Route = createFileRoute("/_authenticated/dashboard/requests/$id/matches")({
  component: RequestMatchesPage,
});

function RequestMatchesPage() {
  const { id } = useParams({ from: "/_authenticated/dashboard/requests/$id/matches" });
  const qc = useQueryClient();
  const fetchMatches = useServerFn(getRequestMatches);
  const unlockFn = useServerFn(unlockMatch);
  const unlockTierFn = useServerFn(unlockRequestTier);
  const partialRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["request-matches", id],
    queryFn: () => fetchMatches({ data: { request_id: id } }),
  });

  const unlockMut = useMutation({
    mutationFn: (match_id: string) => unlockFn({ data: { match_id } }),
    onSuccess: (r) => {
      toast.success(`Match unlocked. Balance: ${r.balance} tokens`);
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["token-balance"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Unlock failed"),
  });

  const tierMut = useMutation({
    mutationFn: (args: { tier: number; scope: "full" | "partial" }) =>
      unlockTierFn({ data: { request_id: id, tier: args.tier, scope: args.scope } }),
    onSuccess: (r) => {
      toast.success(`Tier ${r.tier} (${r.scope}) unlocked — ${r.tokens_spent} tokens spent. Balance: ${r.balance}`);
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["token-balance"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Tier unlock failed"),
  });

  const confirmFn = useServerFn(requestMatchConfirmation);
  const confirmMut = useMutation({
    mutationFn: (match_id: string) => confirmFn({ data: { match_id } }),
    onSuccess: () => {
      toast.success("Confirmation request sent to the freelancer");
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["engagements"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const sosFn = useServerFn(triggerSosCall);
  const sosMut = useMutation({
    mutationFn: () => sosFn({ data: { request_id: id } }),
    onSuccess: (r: any) => {
      toast.success(`SOS Call sent to ${r?.target_count ?? 0} freelancer(s) at ≥${r?.min_pct ?? 75}% affinity.`);
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "SOS Call failed"),
  });

  const refundFn = useServerFn(refundAndCloseRequest);
  const refundMut = useMutation({
    mutationFn: (mode: "full" | "partial") => refundFn({ data: { request_id: id, mode } }),
    onSuccess: (r: any) => {
      toast.success(`Refund credited: ${r?.refund_tokens ?? 0} tokens (${r?.refund_pct ?? 0}%).`);
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["token-balance"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Refund failed"),
  });

  const requestFilled = data?.request.status === "filled" || data?.request.status === "completed";
  const isFirstDayToday = data ? new Date().toISOString().slice(0, 10) === data.request.start_date : false;
  const sosEligible = data && !requestFilled && isFirstDayToday && data.request.duration !== "full_season";

  const renderPool = (
    label: string,
    scope: "full" | "partial",
    tiers: any[],
    items: any[],
  ) => {
    return (
      <div>
        {tiers.map((t) => {
          if (t.real_count === 0) return null;
          const tierItems = items.filter((i) => i.tier === t.tier);
          const isLocked = !t.unlocked;
          return (
            <section key={`${scope}-${t.tier}`} className="mt-8">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2">
                <div>
                  <div className="label-mono">
                    [{label} · TIER {t.tier}] {(() => {
                      const t2 = tiers.find((x) => x.tier === 2)?.size ?? 10;
                      if (t.tier === 1) return "Top matches (1–10)";
                      if (t.tier === 2) return `Matches 11–${10 + t.size}`;
                      return `Matches ${11 + t2}–${10 + t2 + t.size}`;
                    })()}
                  </div>
                  <div className="mt-1 text-xl font-black italic tracking-tighter">
                    {t.tier === 1 ? "Free preview" : t.unlocked ? "Unlocked" : `Locked — ${t.entry_cost} token${t.entry_cost === 1 ? "" : "s"} to open`}
                  </div>
                  <div className="font-mono text-[11px] uppercase text-muted-foreground">
                    {t.real_count} real match{t.real_count === 1 ? "" : "es"} in this tier
                  </div>
                </div>
                {isLocked && (
                  <div className="max-w-md text-right">
                    {t.proportional && (
                      <div className="mb-2 flex items-start gap-2 border border-racing-yellow/50 bg-racing-yellow/10 p-2 text-left font-mono text-[11px] text-racing-yellow">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                        <span>
                          Only {t.real_count} real match{t.real_count === 1 ? "" : "es"} in this tier (max {t.size}). Entry fee reduced proportionally from {t.entry_cost_full} to {t.entry_cost} token{t.entry_cost === 1 ? "" : "s"}.
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        const msg = t.proportional
                          ? `Unlock ${label.toLowerCase()} tier ${t.tier} for ${t.entry_cost} token${t.entry_cost === 1 ? "" : "s"}? (Reduced from ${t.entry_cost_full} — only ${t.real_count} real matches available in this tier.)`
                          : `Unlock ${label.toLowerCase()} tier ${t.tier} for ${t.entry_cost} token${t.entry_cost === 1 ? "" : "s"}? This exposes ${t.real_count} more match card${t.real_count === 1 ? "" : "s"} (still blurred until per-profile unlock).`;
                        if (confirm(msg)) tierMut.mutate({ tier: t.tier, scope });
                      }}
                      disabled={tierMut.isPending}
                      className="bg-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
                    >
                      <Unlock className="mr-1 inline size-3" /> Unlock tier {t.tier} ({t.entry_cost} tk)
                    </button>
                  </div>
                )}
              </div>

              {isLocked ? (
                <div className="grid gap-3">
                  {Array.from({ length: t.real_count }).map((_, i) => (
                    <TierPlaceholder key={i} rank={(t.tier === 2 ? 11 : 11 + (tiers.find((x) => x.tier === 2)?.size ?? 10)) + i} />
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
                        if (confirm("Send a confirmation request for this match? If the freelancer accepts, the request is closed, all other pending requests for it are cancelled, and contacts are exchanged.")) {
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
      <div className="container-page py-10">
        <Link to="/dashboard/requests" className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> Back to requests
        </Link>

        {isLoading && <div className="text-sm text-muted-foreground">Loading matches…</div>}

        {data && (
          <>
            <div className="border border-border bg-card p-5">
              <div className="label-mono">[REQUEST]</div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">{data.request.title}</h1>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {data.request.sub_role ? `${subRoleLabel(data.request.sub_role)} (${levelLabel(data.request.sub_role_min_level ?? "junior")}+)` : roleGroupLabel(data.request.role_group)} · {disciplineLabel(data.request.discipline)} · {data.request.start_date} → {data.request.end_date}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Matches are grouped in three tiers. <span className="font-bold text-racing-yellow">Top 3</span> are always previewable for free (technical details, no contacts). Ranks 4–10 stay blurred until you spend {data.per_profile_cost} token{data.per_profile_cost === 1 ? "" : "s"} per profile. Tiers 2 (11–20) and 3 (21–50) require a one-time entry fee — reduced proportionally when fewer matches exist. Nothing beyond rank {data.hard_cap} is ever exposed.
              </p>
              <div className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {data.total_matches} full match{data.total_matches === 1 ? "" : "es"} · {data.total_partial_matches} partial (capped at {data.hard_cap})
              </div>
              {sosEligible && (
                <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-2 border-racing-red bg-racing-red/10 p-4">
                  <div className="min-w-0">
                    <div className="label-mono text-racing-red">[SOS CALL — FIRST DAY ONLY]</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Emergency broadcast to all high-affinity freelancers available today. The first to accept fills the match automatically.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm("Trigger SOS Call for today? Every high-affinity freelancer available today will be notified. The first to accept locks the match — this is irreversible.")) {
                        sosMut.mutate();
                      }
                    }}
                    disabled={sosMut.isPending}
                    className="bg-racing-red px-4 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
                  >
                    <Flame className="mr-1 inline size-3" /> Trigger SOS Call
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
                    ) : <div className="text-muted-foreground">No email on file</div>}
                    {data.hired.phone_number ? (
                      <a href={`tel:${(data.hired.phone_dial_code ?? "")}${data.hired.phone_number}`} className="flex items-center gap-2 text-racing-red hover:underline">
                        <Phone className="size-3" /> {data.hired.phone_dial_code} {data.hired.phone_number}
                      </a>
                    ) : <div className="text-muted-foreground">No phone on file</div>}
                  </div>
                </div>

                <div className="mt-4 border-t border-racing-yellow/30 pt-4">
                  <div className="label-mono mb-2 text-racing-yellow">[QUICK ACTIONS]</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Add match dates to calendar</div>
                      <CalendarQuickButtons
                        event={{
                          title: `Match — ${data.request.title}`,
                          startDate: data.request.start_date,
                          endDate: data.request.end_date,
                          location: data.request.location ?? data.request.circuit ?? null,
                          description: `${roleLabel(data.request.role)} · ${disciplineLabel(data.request.discipline)}\nFreelancer: ${data.hired.display_name ?? ""}${data.hired.contact_email ? `\nEmail: ${data.hired.contact_email}` : ""}${data.hired.phone_number ? `\nPhone: ${data.hired.phone_dial_code ?? ""} ${data.hired.phone_number}` : ""}`,
                        }}
                      />
                    </div>
                    <div>
                      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Save freelancer contact</div>
                      <ContactQuickButtons
                        contact={{
                          fullName: data.hired.display_name ?? "Freelancer",
                          email: data.hired.contact_email ?? null,
                          phone: data.hired.phone_number ? `${data.hired.phone_dial_code ?? ""}${data.hired.phone_number}`.replace(/\s+/g, "") : null,
                          title: data.hired.role ? roleLabel(data.hired.role) : null,
                          notes: `PaddockMatch — Match confirmed for "${data.request.title}"`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Trivio: zero total matches, still active, no refund yet */}
            {data.total_matches === 0 && !requestFilled && !(data.request as any).partial_refund_taken && (
              <ZeroMatchTrivio
                quote={(data as any).refund_quote}
                hasPartials={data.total_partial_matches > 0}
                onWait={() => toast.info("Search stays active. You'll be notified as soon as a full match appears.")}
                onRefund={() => {
                  const q = (data as any).refund_quote;
                  if (confirm(`Close this request and take a refund of ${q.refund_full} token(s) (${q.refund_pct}% of ${q.spent})? The request will be archived as unfilled.`)) {
                    refundMut.mutate("full");
                  }
                }}
                onPartial={() => {
                  const q = (data as any).refund_quote;
                  if (confirm(`Unlock partial matches now and take a HALVED refund of ${q.refund_partial} token(s)? You keep browsing partial candidates; if a full match later confirms, no additional refund is granted.`)) {
                    refundMut.mutate("partial");
                  }
                }}
                loading={refundMut.isPending}
              />
            )}

            {(data.request as any).partial_refund_taken && (data.request as any).refund_kind === "partial" && (
              <div className="mt-6 border border-racing-yellow/50 bg-racing-yellow/5 p-4 text-xs text-racing-yellow">
                <span className="font-mono uppercase tracking-widest">[PARTIAL REFUND COLLECTED]</span>{" "}
                <span className="ml-2">{(data.request as any).refund_tokens} token(s) credited ({(data.request as any).refund_pct}%). Partial matches are now open below.</span>
              </div>
            )}

            {data.items.length === 0 && data.items_partial.length === 0 && !((data.total_matches === 0) && !requestFilled) && (
              <div className="mt-6 border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                No matches for this request yet.
              </div>
            )}

            {/* FULL matches */}
            {renderPool("FULL", "full", data.tiers, data.items)}

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
                          Your top matches are at <span className="font-black text-racing-yellow">{data.partial_banner.best_full_skill}%</span>, but there are partial matches with a <span className="font-black text-racing-yellow">{data.partial_banner.best_partial_skill}%</span> affinity (with some missing days). Want to see them?
                        </>
                      ) : (
                        <>Looking for more options with flexible dates? Check other professionals with partial availability and evaluate their missing days.</>
                      )}
                    </p>
                    <button
                      onClick={() => partialRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="mt-3 bg-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110"
                    >
                      View {data.partial_banner.partial_count} partial match{data.partial_banner.partial_count === 1 ? "" : "es"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PARTIAL matches */}
            {data.items_partial.length > 0 && (
              <div ref={partialRef}>
                {renderPool("PARTIAL", "partial", data.tiers_partial, data.items_partial)}
              </div>
            )}
          </>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}

function TierPlaceholder({ rank }: { rank: number }) {
  return (
    <div className="relative overflow-hidden border border-dashed border-border bg-card p-5">
      <div className="pointer-events-none select-none blur-md">
        <div className="text-3xl font-black italic tracking-tighter text-muted-foreground">??% Match</div>
        <div className="mt-2 h-4 w-40 bg-secondary" />
        <div className="mt-2 h-3 w-64 bg-secondary" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-2 border border-border bg-background/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur">
          <EyeOff className="size-3" /> Rank #{rank} — tier locked
        </div>
      </div>
    </div>
  );
}

function MatchCard({ match, onUnlock, onConfirm, loading, requestFilled, perProfileCost }: { match: any; onUnlock: () => void; onConfirm: () => void; loading: boolean; requestFilled: boolean; perProfileCost: number }) {
  const pct = Math.round(match.skills_score ?? match.match_score);
  const perfect = match.is_perfect;
  const blurred = match.blurred;
  const isPartial = match.is_partial;
  const edgeOnly = match.edge_only;
  const gapLabel = edgeOnly ? "Missing days at edges only" : "Missing days include central days";
  const partialBorder = edgeOnly ? "border-racing-yellow/60 bg-racing-yellow/5" : "border-racing-red/60 bg-racing-red/5";
  const gapBadge = edgeOnly
    ? "border-racing-yellow/60 bg-racing-yellow/10 text-racing-yellow"
    : "border-racing-red/60 bg-racing-red/10 text-racing-red";
  const gapDot = edgeOnly ? "bg-racing-yellow" : "bg-racing-red";

  return (
    <div className={`border p-5 ${perfect ? "border-racing-yellow bg-racing-yellow/5" : isPartial ? partialBorder : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {match.unlocked ? <Unlock className="size-4 text-racing-yellow" /> : <Lock className="size-4 text-muted-foreground" />}
          <div>
            <div className={`text-3xl font-black italic tracking-tighter ${perfect ? "text-racing-yellow" : "text-racing-red"}`}>
              {pct}% <span className="text-sm font-mono uppercase tracking-widest">{perfect ? "Perfect match" : "Skills affinity"}</span>
            </div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Rank #{match.rank} · tier {match.tier} · {match.overlap_days} day{match.overlap_days === 1 ? "" : "s"} of overlap
              {match.top_three && <span className="ml-2 text-racing-yellow">· TOP 3 FREE</span>}
              {match.free_preview && !match.top_three && match.unlocked && <span className="ml-2 text-racing-yellow">· UNLOCKED</span>}
            </div>
            {isPartial && (
              <div className={`mt-1 inline-flex items-center gap-2 border ${gapBadge} px-2 py-1 font-mono text-[10px] uppercase tracking-widest`} title={gapLabel}>
                <span className={`inline-block size-2 rounded-full ${gapDot}`} />
                <Clock className="size-3" /> {match.missing_days} missing day{match.missing_days === 1 ? "" : "s"} · {gapLabel}
              </div>
            )}
            {match.rating && match.rating.count > 0 && (
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
              <Unlock className="size-3" /> Unlock details ({perProfileCost} tk)
            </button>
          )}
          {match.unlocked && !requestFilled && (
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex items-center gap-2 bg-racing-yellow px-4 py-2 text-xs font-bold uppercase tracking-widest text-carbon hover:brightness-110 disabled:opacity-60"
            >
              Request confirmation
            </button>
          )}
          {requestFilled && (
            <span className="border border-racing-yellow bg-racing-yellow/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-racing-yellow">
              Match already assigned
            </span>
          )}
        </div>
      </div>

      {match.unlocked && match.profile ? (
        <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center border border-border bg-secondary font-black uppercase text-muted-foreground">
                <Lock className="size-4" />
              </div>
              <div>
                <div className="text-lg font-bold text-muted-foreground">Hidden freelancer</div>
                {match.profile.role_group && <div className="font-mono text-[11px] uppercase text-muted-foreground">{roleGroupLabel(match.profile.role_group)}{parseSubRoles(match.profile.sub_roles).length ? ` · ${parseSubRoles(match.profile.sub_roles).map((sr) => `${subRoleLabel(sr.sub_role)} (${levelLabel(sr.level)})`).join(", ")}` : ""}</div>}
              </div>
            </div>
            {match.profile.headline && <p className="mt-3 text-sm">{match.profile.headline}</p>}
            {match.profile.bio && <p className="mt-2 text-xs text-muted-foreground">{match.profile.bio}</p>}
            <div className="mt-3 space-y-1 font-mono text-[11px] uppercase text-muted-foreground">
              {match.profile.location && <div>📍 {match.profile.location}</div>}
              {match.profile.day_rate != null && <div>€{match.profile.day_rate}/day</div>}
              <div>Travels: {match.profile.travels ? "yes" : "no"}</div>
            </div>
          </div>
          <div>
            <div className="label-mono mb-1">[CONTACT]</div>
            <div className="rounded border border-border bg-background/50 p-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Name and contacts are revealed only after the freelancer confirms the match.
            </div>
            {match.profile.disciplines?.length > 0 && (
              <>
                <div className="label-mono mb-1 mt-3">[DISCIPLINES]</div>
                <div className="flex flex-wrap gap-1">
                  {match.profile.disciplines.map((d: string) => (
                    <span key={d} className="border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase">{disciplineLabel(d)}</span>
                  ))}
                </div>
              </>
            )}
            {match.profile.skills?.length > 0 && (
              <>
                <div className="label-mono mb-1 mt-3">[SKILLS]</div>
                <div className="flex flex-wrap gap-1">
                  {match.profile.skills.map((s: string) => (
                    <span key={s} className="border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase">{s}</span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="md:col-span-2 border-t border-border pt-4">
            <div className="label-mono mb-2 flex items-center gap-2"><Star className="size-3 text-racing-yellow" /> {match.missing_criteria.length === 0 ? "Criteria" : "Missing / partial criteria"}</div>
            {match.missing_criteria.length === 0 ? (
              <div className="font-mono text-[11px] text-racing-yellow">All soft criteria satisfied — 100% match</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {match.missing_criteria.map((c: any, i: number) => (
                  <span key={i} className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${c.hard ? "border-racing-red text-racing-red" : "border-border text-muted-foreground"}`}>
                    {formatCriterion(c)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 border-t border-border pt-4">
          <div className="label-mono mb-2 flex items-center gap-2"><Star className="size-3 text-racing-yellow" /> Missing / partial criteria</div>
          {match.missing_criteria.length === 0 ? (
            <div className="font-mono text-[11px] text-racing-yellow">All soft criteria satisfied — 100% match</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {match.missing_criteria.map((c: any, i: number) => (
                <span key={i} className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${c.hard ? "border-racing-red text-racing-red" : "border-border text-muted-foreground"}`}>
                  {formatCriterion(c)}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 rounded border border-border bg-background/50 p-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Technical details are hidden until you unlock ({perProfileCost} token{perProfileCost === 1 ? "" : "s"}). Real name and contacts appear only after the freelancer confirms the match.
          </div>
        </div>
      )}
    </div>
  );
}

function formatCriterion(c: any): string {
  switch (c.kind) {
    case "role": return `Role: ${c.label ?? ""}`;
    case "skill": return `Skill: ${c.label}`;
    case "language": return `Lang: ${c.code} (${c.level})`;
    case "education": return "Education";
    case "day_rate": return "Day rate over budget";
    case "location": return `Location: ${c.label ?? "distant"}`;
    case "missing_days": return `${c.days} missing day${c.days === 1 ? "" : "s"}`;
    default: return c.kind ?? "criterion";
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
  return (
    <div className="mt-6 border-2 border-racing-red bg-racing-red/5 p-5">
      <div className="label-mono text-racing-red">[ZERO MATCHES — CHOOSE YOUR MOVE]</div>
      <h2 className="mt-1 text-2xl font-black uppercase italic tracking-tighter">Nothing matches your criteria — yet</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Refund quote: <span className="font-bold text-racing-yellow">{quote.refund_pct}%</span> of {quote.spent} token{quote.spent === 1 ? "" : "s"} spent
        {" "}= <span className="font-bold text-racing-yellow">{quote.refund_full}</span> token{quote.refund_full === 1 ? "" : "s"}.
        {" "}Based on {quote.hard_count} hard filter{quote.hard_count === 1 ? "" : "s"} (floor {quote.min_pct}%, −{quote.drop_pct}% per hard filter).
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="flex flex-col border border-border bg-card p-4">
          <div className="label-mono">[OPTION 1]</div>
          <div className="text-lg font-black uppercase italic">Keep searching</div>
          <p className="mt-1 flex-1 text-xs text-muted-foreground">
            Leave the request live. As soon as a freelancer becomes 100% available, you're notified and the standard first-come-first-served flow resumes. No refund — the search is still alive.
          </p>
          <button onClick={onWait} className="mt-3 border border-racing-yellow px-3 py-2 text-xs font-bold uppercase tracking-widest text-racing-yellow hover:bg-racing-yellow/10">
            Keep waiting
          </button>
        </div>
        <div className="flex flex-col border border-border bg-card p-4">
          <div className="label-mono">[OPTION 2]</div>
          <div className="text-lg font-black uppercase italic">Refund & close</div>
          <p className="mt-1 flex-1 text-xs text-muted-foreground">
            Accept the {quote.refund_full}-token refund and archive this request as completed — unfilled. Final: no further changes.
          </p>
          <button
            onClick={onRefund}
            disabled={loading || quote.refund_full === 0}
            className="mt-3 bg-racing-red px-3 py-2 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-40"
          >
            Take {quote.refund_full} tk & close
          </button>
        </div>
        <div className={`flex flex-col border p-4 ${hasPartials ? "border-border bg-card" : "border-border/40 bg-secondary/40 opacity-60"}`}>
          <div className="label-mono">[OPTION 3]</div>
          <div className="text-lg font-black uppercase italic">Unlock partials</div>
          <p className="mt-1 flex-1 text-xs text-muted-foreground">
            {hasPartials
              ? `See freelancers available only for part of the dates now. Refund is halved to ${quote.refund_partial} token${quote.refund_partial === 1 ? "" : "s"}. Request stays open — if a full match later confirms, no extra refund.`
              : "No partial candidates exist for this request yet."}
          </p>
          <button
            onClick={onPartial}
            disabled={loading || !hasPartials || quote.refund_partial === 0}
            className="mt-3 border border-racing-red px-3 py-2 text-xs font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10 disabled:opacity-40"
          >
            Take {quote.refund_partial} tk & unlock
          </button>
        </div>
      </div>
    </div>
  );
}
