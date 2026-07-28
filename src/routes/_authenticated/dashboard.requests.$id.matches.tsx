import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { RatingIcons } from "@/components/rating-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock, Unlock, Mail, Phone, Star, ArrowLeft, AlertTriangle, EyeOff } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getRequestMatches, unlockMatch, requestMatchConfirmation, unlockRequestTier } from "@/lib/paddock.functions";
import { roleLabel, disciplineLabel } from "@/lib/paddock";
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
    mutationFn: (tier: number) => unlockTierFn({ data: { request_id: id, tier } }),
    onSuccess: (r) => {
      toast.success(`Tier ${r.tier} unlocked — ${r.tokens_spent} tokens spent. Balance: ${r.balance}`);
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
                {roleLabel(data.request.role)} · {disciplineLabel(data.request.discipline)} · {data.request.start_date} → {data.request.end_date}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Matches are grouped in three tiers. <span className="font-bold text-racing-yellow">Top 3</span> are always previewable for free (technical details, no contacts). Ranks 4–10 stay blurred until you spend {data.per_profile_cost} token{data.per_profile_cost === 1 ? "" : "s"} per profile. Tiers 2 (11–20) and 3 (21–50) require a one-time entry fee — reduced proportionally when fewer matches exist. Nothing beyond rank {data.hard_cap} is ever exposed.
              </p>
              <div className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {data.total_matches} match{data.total_matches === 1 ? "" : "es"} total (capped at {data.hard_cap})
              </div>
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
                        {data.hired.role && <>{roleLabel(data.hired.role)}</>}
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

            {data.items.length === 0 && (
              <div className="mt-6 border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                No matches for this request yet.
              </div>
            )}

            {data.tiers.map((t) => {
              if (t.real_count === 0) return null;
              const tierItems = data.items.filter((i) => i.tier === t.tier);
              const requestFilled = data.request.status === "filled" || data.request.status === "completed";
              const isLocked = !t.unlocked;
              return (
                <section key={t.tier} className="mt-8">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2">
                    <div>
                      <div className="label-mono">
                        [TIER {t.tier}] {(() => {
                          const t2 = data.tiers.find((x) => x.tier === 2)?.size ?? 10;
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
                              ? `Unlock tier ${t.tier} for ${t.entry_cost} token${t.entry_cost === 1 ? "" : "s"}? (Reduced from ${t.entry_cost_full} — only ${t.real_count} real matches available in this tier.)`
                              : `Unlock tier ${t.tier} for ${t.entry_cost} token${t.entry_cost === 1 ? "" : "s"}? This exposes ${t.real_count} more match card${t.real_count === 1 ? "" : "s"} (still blurred until per-profile unlock).`;
                            if (confirm(msg)) tierMut.mutate(t.tier);
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
                        <TierPlaceholder key={i} rank={(t.tier === 2 ? 11 : 11 + (data.tiers.find((x) => x.tier === 2)?.size ?? 10)) + i} />
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {tierItems.map((m) => (
                        <MatchCard
                          key={m.match_id}
                          match={m}
                          perProfileCost={data.per_profile_cost}
                          requestFilled={requestFilled}
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
  const pct = Math.round(match.match_score);
  const perfect = match.is_perfect;
  const blurred = match.blurred;

  return (
    <div className={`border p-5 ${perfect ? "border-racing-yellow bg-racing-yellow/5" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {match.unlocked ? <Unlock className="size-4 text-racing-yellow" /> : <Lock className="size-4 text-muted-foreground" />}
          <div>
            <div className={`text-3xl font-black italic tracking-tighter ${perfect ? "text-racing-yellow" : "text-racing-red"}`}>
              {pct}% <span className="text-sm font-mono uppercase tracking-widest">{perfect ? "Perfect match" : "Match"}</span>
            </div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Rank #{match.rank} · tier {match.tier} · {match.overlap_days} day{match.overlap_days === 1 ? "" : "s"} of overlap
              {match.top_three && <span className="ml-2 text-racing-yellow">· TOP 3 FREE</span>}
              {match.free_preview && !match.top_three && match.unlocked && <span className="ml-2 text-racing-yellow">· UNLOCKED</span>}
            </div>
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
                {match.profile.role && <div className="font-mono text-[11px] uppercase text-muted-foreground">{roleLabel(match.profile.role)}</div>}
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
    default: return c.kind ?? "criterion";
  }
}
