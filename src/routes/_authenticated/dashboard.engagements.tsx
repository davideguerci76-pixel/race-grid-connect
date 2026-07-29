import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RatingPicker, RatingIcons } from "@/components/rating-icons";
import { CalendarQuickButtons, ContactQuickButtons } from "@/components/match-quick-actions";
import { getMyEngagements, confirmEngagement, markEngagementComplete, submitRatingV2, getRatableEngagements, markAllNotificationsRead, cancelEngagement, getMyNotifications } from "@/lib/paddock.functions";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/engagements")({
  component: EngagementsPage,
});

function EngagementsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const getFn = useServerFn(getMyEngagements);
  const confirmFn = useServerFn(confirmEngagement);
  const completeFn = useServerFn(markEngagementComplete);
  const rateFn = useServerFn(submitRatingV2);
  const ratableFn = useServerFn(getRatableEngagements);
  const markRead = useServerFn(markAllNotificationsRead);
  const notifsFn = useServerFn(getMyNotifications);

  const { data: rows = [] } = useQuery({ queryKey: ["engagements"], queryFn: () => getFn() });
  const { data: ratable = [] } = useQuery({ queryKey: ["engagements-ratable"], queryFn: () => ratableFn() });
  const { data: notifications = [] } = useQuery({ queryKey: ["my-notifications", user?.id], enabled: !!user?.id, queryFn: () => notifsFn() });
  const { data: myRatedIds = [] } = useQuery({
    queryKey: ["my-rated-engagement-ids", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("ratings").select("engagement_id, unlocked_at").eq("from_user_id", user!.id);
      if (error) return [];
      return (data ?? []) as { engagement_id: string; unlocked_at: string | null }[];
    },
  });
  const ratedMap = new Map<string, { unlocked: boolean }>((myRatedIds as any[]).map((r) => [r.engagement_id, { unlocked: !!r.unlocked_at }]));
  const ratableMap = new Map<string, any>((ratable as any[]).map((e) => [e.id, e]));

  useEffect(() => {
    markRead().then(() => qc.invalidateQueries({ queryKey: ["unread-notifications"] })).catch(() => {});
  }, [markRead, qc]);

  // Realtime: first-come-first-served. When another freelancer accepts a competing proposal,
  // the DB flips this user's proposed engagement to 'cancelled' and inserts a 'match_taken'
  // notification. Refetch live so the Confirm button disappears instantly, and surface a
  // clear "waitlist" toast. Confirmed engagements block calendar days; waitlisted ones do not.
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`engagements-live-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "engagements", filter: `freelancer_id=eq.${user.id}` },
        (payload: any) => {
          const oldRow = payload.old ?? {};
          const newRow = payload.new ?? {};
          qc.invalidateQueries({ queryKey: ["engagements"] });
          qc.invalidateQueries({ queryKey: ["matches"] });
          if (oldRow.status === "proposed" && newRow.status === "cancelled" && !newRow.cancelled_by) {
            toast.info("Another freelancer accepted first — you're on the waitlist. Your calendar stays open in case the match reopens.");
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const kind = payload.new?.kind;
          qc.invalidateQueries({ queryKey: ["unread-notifications"] });
          if (kind === "match_taken" || kind === "match_reopened" || kind === "sos_call" || kind === "engagement_proposed") {
            qc.invalidateQueries({ queryKey: ["engagements"] });
            qc.invalidateQueries({ queryKey: ["matches"] });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  const [ratingFor, setRatingFor] = useState<string | null>(null);
  // Sub-scores (freelance being rated by team)
  const [tech, setTech] = useState(5);
  const [punct, setPunct] = useState(5);
  const [stress, setStress] = useState(5);
  // Single overall (team being rated by freelance)
  const [overall, setOverall] = useState(5);
  const [comment, setComment] = useState("");
  const [locallySubmittedRatings, setLocallySubmittedRatings] = useState<Set<string>>(() => new Set());

  const confirmMut = useMutation({
    mutationFn: (id: string) => confirmFn({ data: { id } }),
    onSuccess: () => { toast.success(t("engagements.confirmed_toast")); qc.invalidateQueries(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to confirm"),
  });
  const completeMut = useMutation({ mutationFn: (id: string) => completeFn({ data: { id } }), onSuccess: () => { toast.success(t("engagements.marked_complete_toast")); qc.invalidateQueries(); } });
  const cancelFn = useServerFn(cancelEngagement);
  const cancelMut = useMutation({
    mutationFn: (v: { engagement_id: string; reason: string | null }) => cancelFn({ data: v }),
    onSuccess: (row: any) => {
      const kind = row?.cancellation_kind;
      if (kind === "grace") toast.success("Cancelled within grace window — no penalty. The request is reopened.");
      else if (kind === "team_late") toast.warning("Late cancellation recorded on your team profile.");
      else if (kind === "freelancer_late") toast.warning("Late cancellation — those days stay blocked on your calendar.");
      else toast.success("Cancelled");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Cancel failed"),
  });
  const rateMut = useMutation({
    mutationFn: (v: { engagement_id: string; isFreelancerReviewer: boolean }) => {
      if (v.isFreelancerReviewer) {
        return rateFn({ data: { engagement_id: v.engagement_id, overall, sub_scores: {}, comment: comment || null } });
      }
      const avg = (tech + punct + stress) / 3;
      return rateFn({ data: { engagement_id: v.engagement_id, overall: Math.round(avg * 10) / 10, sub_scores: { technical: tech, punctuality: punct, stress }, comment: comment || null } });
    },
    onSuccess: (res: any, variables) => {
      setLocallySubmittedRatings((prev) => {
        const next = new Set(prev);
        next.add(variables.engagement_id);
        return next;
      });
      if (res && res.ok === false && res.already_rated) {
        toast.info(t("rating.submitted"));
      } else {
        toast.success(t("rating.submitted_bonus"));
      }
      setRatingFor(null); setComment(""); setTech(5); setPunct(5); setStress(5); setOverall(5);
      qc.invalidateQueries();
      qc.refetchQueries({ queryKey: ["engagements-ratable"] });
      qc.refetchQueries({ queryKey: ["my-rated-engagement-ids"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });


  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="label-mono">[ENGAGEMENTS]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("engagements.title")}</h1>

        {notifications.length > 0 && (
          <div className="mt-6 border border-border bg-card">
            <div className="border-b border-border px-4 py-2 label-mono">[NOTIFICATIONS]</div>
            <ul className="divide-y divide-border">
              {(notifications as any[]).slice(0, 15).map((n) => {
                const unread = !n.read_at;
                const isStale = n.kind === "calendar_stale";
                return (
                  <li key={n.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${unread ? "bg-racing-red/5" : ""}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {unread && <span className="inline-block h-2 w-2 rounded-full bg-racing-red" />}
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{n.kind}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                      </div>
                      <div className="mt-1 text-sm">
                        {isStale
                          ? "Your availability calendar hasn't been updated in a while. Keep it fresh to rank higher in team searches."
                          : (n.payload?.message ?? n.kind)}
                      </div>
                    </div>
                    {isStale && (
                      <Link to="/dashboard/calendar" className="border border-racing-yellow bg-racing-yellow/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-racing-yellow hover:brightness-110">
                        Update calendar
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-8 grid gap-3">
          {rows.length === 0 && <div className="border border-border bg-card p-12 text-center text-sm text-muted-foreground">—</div>}
          {rows.map((e: any) => {
            const isFreelancer = user?.id === e.freelancer_id;
            const other = isFreelancer ? e.team : e.freelancer;
            const otherId = isFreelancer ? e.team_id : e.freelancer_id;
            const iMarked = isFreelancer ? e.freelancer_marked_complete : e.team_marked_complete;
            const tp = e.team_profile;
            const fp = e.freelancer_profile;
            const req = e.request;
            const match = e.match;
            const pct = match ? Math.round(Number(match.match_score ?? 0)) : null;
            const perfect = match?.is_perfect;
            const skillsSoft: string[] = req?.skills ?? [];
            const skillsHard: string[] = req?.skills_hard ?? [];
            const languages: any[] = req?.languages ?? [];
            const education: string[] = req?.education ?? [];
            const missing: any[] = match?.missing_criteria ?? [];
            return (
              <div key={e.id} className={`border p-5 ${perfect ? "border-racing-yellow bg-racing-yellow/5" : "border-border bg-card"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      {pct !== null && (
                        <div className={`text-2xl font-black italic tracking-tighter ${perfect ? "text-racing-yellow" : "text-racing-red"}`}>
                          {pct}% <span className="font-mono text-[10px] uppercase tracking-widest">{perfect ? "Perfect" : "Match"}</span>
                        </div>
                      )}
                      <div className="font-bold">{isFreelancer ? (tp?.team_name ?? other?.display_name) : (fp?.headline ? `${other?.display_name}` : other?.display_name)}</div>
                    </div>
                    {isFreelancer && tp && (
                      <div className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
                        {tp.team_type && <span>{tp.team_type}</span>}
                        {tp.location && <span> · {tp.location}</span>}
                        {tp.primary_discipline && <span> · {t(`discipline.${tp.primary_discipline}`, { defaultValue: tp.primary_discipline })}</span>}
                      </div>
                    )}
                    {!isFreelancer && fp && (
                      <div className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
                        {fp.role && <span>{t(`role.${fp.role}`, { defaultValue: fp.role })}</span>}
                        {fp.location && <span> · {fp.location}</span>}
                        {typeof fp.day_rate === "number" && <span> · €{fp.day_rate}/day</span>}
                      </div>
                    )}
                  </div>
                  <span className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest">
                    {t(`engagements.status.${e.status}`)}
                  </span>
                </div>

                {req && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="label-mono mb-1">[REQUEST]</div>
                    <div className="text-sm font-bold">{req.title}</div>
                    <div className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
                      {t(`role.${req.role}`, { defaultValue: req.role })} · {t(`discipline.${req.discipline}`, { defaultValue: req.discipline })} · {req.start_date} → {req.end_date}
                      {(req.budget_min || req.budget_max) && <span> · €{req.budget_min ?? "?"}–{req.budget_max ?? "?"}/{req.budget_unit}</span>}
                    </div>
                    {(skillsHard.length > 0 || skillsSoft.length > 0) && (
                      <div className="mt-2">
                        <div className="label-mono mb-1">[SKILLS]</div>
                        <div className="flex flex-wrap gap-1">
                          {skillsHard.map((s) => (
                            <span key={`h-${s}`} className="border border-racing-red bg-racing-red/10 px-2 py-0.5 font-mono text-[10px] uppercase text-racing-red">{t(`skills.${s}`, { defaultValue: s })} · hard</span>
                          ))}
                          {skillsSoft.filter((s) => !skillsHard.includes(s)).map((s) => (
                            <span key={`s-${s}`} className="border border-racing-yellow bg-racing-yellow/10 px-2 py-0.5 font-mono text-[10px] uppercase text-racing-yellow">{t(`skills.${s}`, { defaultValue: s })}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {languages.length > 0 && (
                      <div className="mt-2">
                        <div className="label-mono mb-1">[LANGUAGES]</div>
                        <div className="flex flex-wrap gap-1">
                          {languages.map((l: any, i: number) => (
                            <span key={i} className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${l.hard ? "border-racing-red text-racing-red" : "border-border text-muted-foreground"}`}>
                              {t(`languages.${l.code}`, { defaultValue: l.code })} ({t(`language_levels.${l.level}`, { defaultValue: l.level })}){l.hard ? " · hard" : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {education.length > 0 && (
                      <div className="mt-2">
                        <div className="label-mono mb-1">[EDUCATION]</div>
                        <div className="flex flex-wrap gap-1">
                          {education.map((ed) => (
                            <span key={ed} className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{t(`education_options.${ed}`, { defaultValue: ed })}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {req.notes && <p className="mt-2 text-xs text-muted-foreground">{req.notes}</p>}
                  </div>
                )}

                {missing.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="label-mono mb-1">Missing / partial criteria</div>
                    <div className="flex flex-wrap gap-1">
                      {missing.map((c: any, i: number) => (
                        <span key={i} className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${c.hard ? "border-racing-red text-racing-red" : "border-border text-muted-foreground"}`}>
                          {c.kind === "role" ? `Role: ${c.label ?? ""}` : c.kind === "skill" ? `Skill: ${c.label}` : c.kind === "language" ? `Lang: ${c.code} (${c.level})` : c.kind === "education" ? "Education" : c.kind === "day_rate" ? "Day rate over budget" : c.kind === "location" ? `Location: ${c.label ?? "distant"}` : (c.kind ?? "criterion")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                  <div className="font-mono text-xs text-muted-foreground">
                    {e.start_date} → {e.end_date} · {e.currency} {e.fee ?? "—"}
                  </div>
                </div>
                {e.notes && <p className="mt-2 text-sm text-muted-foreground">{e.notes}</p>}
                {(e.status === "confirmed" || e.status === "completed") && (
                  <div className="mt-4 border-t border-border pt-3">
                    {!isFreelancer && (
                      <div className="mb-4">
                        <div className="label-mono mb-2 text-racing-yellow">[FREELANCER CONTACT]</div>
                        <div className="grid gap-1 text-xs">
                          <div><span className="text-muted-foreground">Name:</span> <span className="font-bold">{other?.display_name ?? fp?.headline ?? "Freelancer"}</span></div>
                          {e.freelancer_contact?.email && (
                            <div><span className="text-muted-foreground">Email:</span> <a href={`mailto:${e.freelancer_contact.email}`} className="font-mono text-racing-red hover:underline">{e.freelancer_contact.email}</a></div>
                          )}
                          {e.freelancer_contact?.phone_number && (
                            <div><span className="text-muted-foreground">Phone:</span> <span className="font-mono">{e.freelancer_contact.phone_dial_code ?? ""} {e.freelancer_contact.phone_number}</span></div>
                          )}
                        </div>
                        <div className="mt-2">
                          <ContactQuickButtons
                            contact={{
                              fullName: other?.display_name ?? "Freelancer",
                              organization: fp?.role ? String(fp.role) : undefined,
                              title: fp?.headline ?? undefined,
                              email: e.freelancer_contact?.email ?? undefined,
                              phone: e.freelancer_contact?.phone_number ? `${e.freelancer_contact?.phone_dial_code ?? ""} ${e.freelancer_contact.phone_number}`.trim() : undefined,
                              notes: req?.title ? `PaddockMatch — ${req.title}` : undefined,
                            }}
                          />

                        </div>
                      </div>
                    )}
                    <div className="label-mono mb-2">[ADD TO CALENDAR]</div>
                    <CalendarQuickButtons
                      event={{
                        title: `Match — ${req?.title ?? other?.display_name ?? "PaddockMatch"}`,
                        startDate: e.start_date,
                        endDate: e.end_date,
                        location: req?.location ?? req?.circuit ?? null,
                        description: req ? `${req.title}${req.notes ? `\n\n${req.notes}` : ""}` : "",
                      }}
                    />
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {e.status === "proposed" && e.proposed_by !== user?.id && (
                    <button onClick={() => confirmMut.mutate(e.id)} className="bg-racing-red px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white hover:brightness-110">
                      {t("engagements.confirm")}
                    </button>
                  )}
                  {e.status === "confirmed" && !iMarked && !isFreelancer && (
                    <button onClick={() => completeMut.mutate(e.id)} className="bg-foreground px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-background hover:bg-racing-red hover:text-white">
                      {t("engagements.mark_complete")}
                    </button>
                  )}
                  {e.status === "confirmed" && (() => {
                    const confirmedAt = e.confirmed_at ? new Date(e.confirmed_at).getTime() : null;
                    const graceEnd = confirmedAt ? confirmedAt + 24 * 3600 * 1000 : null;
                    const firstDay = new Date(e.start_date + "T00:00:00").getTime();
                    const now = Date.now();
                    const inGrace = graceEnd !== null && now < graceEnd && now < firstDay;
                    const label = inGrace
                      ? `Cancel (grace: ${Math.max(0, Math.round((graceEnd! - now) / 3600000))}h left)`
                      : isFreelancer
                      ? "Cancel (late — days stay blocked)"
                      : "Cancel (late — logged on profile)";
                    const warn = inGrace
                      ? "Cancel this confirmed match? You are within the 24h grace window: no penalty and the request reopens for other candidates."
                      : isFreelancer
                      ? "You are past the grace window. The engaged days remain blocked on your calendar and the request will be reopened for other candidates. Continue?"
                      : "You are past the grace window. This cancellation will be recorded on your public team profile and the request will be archived. Continue?";
                    return (
                      <button
                        onClick={() => {
                          if (!confirm(warn)) return;
                          const reason = window.prompt("Reason (optional):", "") ?? "";
                          cancelMut.mutate({ engagement_id: e.id, reason: reason.trim() || null });
                        }}
                        className={`px-4 py-2 text-[11px] font-bold uppercase tracking-widest ${inGrace ? "border border-border hover:bg-secondary" : "border border-racing-red text-racing-red hover:bg-racing-red/10"}`}
                      >
                        {label}
                      </button>
                    );
                  })()}


                  {(e.status === "confirmed" || e.status === "completed") && (() => {
                    const info = ratableMap.get(e.id);
                    const mineRated = ratedMap.get(e.id);
                    const alreadyRated = !!info?.already_rated || !!mineRated || locallySubmittedRatings.has(e.id);
                    const unlocked = !!info?.unlocked || !!mineRated?.unlocked;
                    const now = info?.sim_now ? new Date(info.sim_now).getTime() : Date.now();
                    const opensAt = info?.opens_at ? new Date(info.opens_at).getTime() : null;
                    const canRate = opensAt !== null && now >= opensAt;
                    if (alreadyRated) {
                      return (
                        <button type="button" disabled className="cursor-not-allowed border border-border bg-muted/40 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground opacity-80">
                          {t("rating.submitted")}
                        </button>
                      );
                    }
                    if (!canRate) {
                      return (
                        <span className="border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          {t("rating.opens_on", { date: info?.opens_at ? new Date(info.opens_at).toLocaleDateString() : "—" })}
                        </span>
                      );
                    }
                    if (ratingFor === e.id) {
                      return (
                        <div className="w-full border border-border bg-background p-4">
                          <div className="label-mono mb-2">{t("engagements.rate_them", { name: other?.display_name })}</div>
                          <div className="mb-2 text-[11px] text-muted-foreground">{t("rating.double_blind_hint")}</div>
                          {isFreelancer ? (
                            <div>
                              <div className="mb-1 text-[11px] uppercase tracking-widest">{t("rating.team_overall")}</div>
                              <RatingPicker variant="headset" value={overall} onChange={setOverall} />
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div>
                                <div className="mb-1 text-[11px] uppercase tracking-widest">{t("rating.technical")}</div>
                                <RatingPicker variant="wrench" value={tech} onChange={setTech} />
                              </div>
                              <div>
                                <div className="mb-1 text-[11px] uppercase tracking-widest">{t("rating.punctuality")}</div>
                                <RatingPicker variant="wrench" value={punct} onChange={setPunct} />
                              </div>
                              <div>
                                <div className="mb-1 text-[11px] uppercase tracking-widest">{t("rating.stress")}</div>
                                <RatingPicker variant="wrench" value={stress} onChange={setStress} />
                              </div>
                              <div className="font-mono text-[11px] text-muted-foreground">
                                {t("rating.overall")}: {((tech + punct + stress) / 3).toFixed(1)}
                              </div>
                            </div>
                          )}
                          <textarea rows={2} value={comment} onChange={(v) => setComment(v.target.value)} placeholder={t("rating.comment_placeholder")} className="mt-3 w-full border border-border bg-background px-3 py-2 text-sm" maxLength={500} />
                          <div className="mt-3 flex gap-2">
                            <button onClick={() => rateMut.mutate({ engagement_id: e.id, isFreelancerReviewer: isFreelancer })} className="bg-racing-red px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white">{t("rating.submit")}</button>
                            <button onClick={() => setRatingFor(null)} className="border border-border px-4 py-2 text-[11px] font-bold uppercase tracking-widest">{t("common.cancel")}</button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <button onClick={() => setRatingFor(e.id)} className="bg-racing-yellow px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-carbon hover:brightness-110">
                        {t("engagements.rate")} <span className="ml-1 text-[9px]">(+1 token bonus)</span>
                      </button>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
