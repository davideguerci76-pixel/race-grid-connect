import { confirmDialog } from "@/hooks/use-confirm";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { roleGroupLabel, subRoleLabel } from "@/lib/roles";
import { disciplineLabel, educationLabel, engagementStatusLabel, languageLabel, languageLevelLabel, skillLabel } from "@/lib/labels";
import { formatCriterion } from "@/lib/criteria-label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RatingPicker, RatingIcons } from "@/components/rating-icons";
import { CalendarQuickButtons, ContactQuickButtons } from "@/components/match-quick-actions";
import { getMyEngagements, markEngagementComplete, submitRatingV2, getRatableEngagements, cancelEngagement, freelancerAnswerContact, teamConfirmContact, revealMatch, withdrawMatchConfirmation } from "@/lib/paddock.functions";
import { addPoolMemberFromEngagement } from "@/lib/pool.functions";
import { MatchRequestActions, MatchRequestDeadline } from "@/components/match-request-actions";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { BackButton } from "@/components/back-button";
import { useDateFormat } from "@/lib/date-locale";
import { PitCallDates } from "@/components/championship-dates";
import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/dashboard/engagements")({
  component: EngagementsPage,
});

function EngagementsPage() {
  const { t } = useTranslation();
  const { formatDate } = useDateFormat();
  const { user } = useAuth();
  const qc = useQueryClient();
  const getFn = useServerFn(getMyEngagements);
  const completeFn = useServerFn(markEngagementComplete);
  const rateFn = useServerFn(submitRatingV2);
  const ratableFn = useServerFn(getRatableEngagements);

  const { data: rows = [] } = useQuery({ queryKey: ["engagements"], queryFn: () => getFn() });
  const { data: ratable = [] } = useQuery({ queryKey: ["engagements-ratable"], queryFn: () => ratableFn() });
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

  // Deep-link support: /dashboard/engagements#engagement-<id> scrolls to the card
  // once the list has been rendered (data arrives after the initial mount).
  // The hash comes from the router so an in-app navigation from the Notification
  // Center re-triggers the scroll even when the page is already mounted.
  const locationHash = useRouterState({ select: (s) => s.location.hash });
  const targetEngagementId = locationHash?.startsWith("engagement-")
    ? locationHash.slice("engagement-".length)
    : locationHash?.startsWith("#engagement-")
      ? locationHash.slice("#engagement-".length)
      : null;

  useEffect(() => {
    if (typeof window === "undefined" || !targetEngagementId || rows.length === 0) return;
    const el = document.getElementById(`engagement-${targetEngagementId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [rows, targetEngagementId]);

  // Do NOT auto-mark all notifications as read on mount — otherwise the bell badge
  // would silently reset before the user has a chance to see it. Users click the
  // "Mark all as read" button below when they've reviewed the list.


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
            toast.info(t("sweep_engage.engagements.waitlist_toast"));
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
  const [locallyPooled, setLocallyPooled] = useState<Set<string>>(() => new Set());
  const addPoolFn = useServerFn(addPoolMemberFromEngagement);
  const addPoolMut = useMutation({
    mutationFn: (engagementId: string) => addPoolFn({ data: { engagement_id: engagementId } }),
    onSuccess: (_res, engagementId) => {
      setLocallyPooled((prev) => new Set(prev).add(engagementId));
      toast.success(t("pool.added"));
      qc.invalidateQueries({ queryKey: ["engagements"] });
      qc.invalidateQueries({ queryKey: ["my-pool"] });
    },
    onError: (err) => toastError(err, "pool.add_failed"),
  });


  const completeMut = useMutation({ mutationFn: (id: string) => completeFn({ data: { id } }), onSuccess: () => { toast.success(t("engagements.marked_complete_toast")); qc.invalidateQueries(); } });
  const revealFn = useServerFn(revealMatch);
  const revealMut = useMutation({
    mutationFn: (matchId: string) => revealFn({ data: { match_id: matchId } }),
    onSuccess: () => { toast.success(t("sweep_engage.matches.revealed_toast")); qc.invalidateQueries(); },
    onError: (e) => toastError(e, "sweep_engage.common.failed"),
  });
  const withdrawFn = useServerFn(withdrawMatchConfirmation);
  const withdrawMut = useMutation({
    mutationFn: (id: string) => withdrawFn({ data: { id } }),
    onSuccess: () => { toast.success(t("engagements.withdrawn_toast", { defaultValue: "Request withdrawn" })); qc.invalidateQueries(); },
    onError: (e) => toastError(e, "sweep_engage.common.failed"),
  });
  const cancelFn = useServerFn(cancelEngagement);
  const cancelMut = useMutation({
    mutationFn: (v: { engagement_id: string; reason: string | null }) => cancelFn({ data: v }),
    onSuccess: (row: any) => {
      const kind = row?.cancellation_kind;
      if (kind === "grace") toast.success(t("sweep_engage.engagements.cancel_grace_toast"));
      else if (kind === "team_late") toast.warning(t("sweep_engage.engagements.cancel_team_late_toast"));
      else if (kind === "freelancer_late") toast.warning(t("sweep_engage.engagements.cancel_freelancer_late_toast"));
      else toast.success(t("sweep_engage.common.cancelled"));
      qc.invalidateQueries();
    },
    onError: (e) => toastError(e, "sweep_engage.engagements.cancel_failed"),
  });

  const answerContactFn = useServerFn(freelancerAnswerContact);
  const answerContactMut = useMutation({
    mutationFn: (v: { engagement_id: string; contacted: boolean }) => answerContactFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.contacted ? t("sweep_engage.engagements.contact_logged_thanks") : t("sweep_engage.engagements.contact_logged_remind"));
      qc.invalidateQueries({ queryKey: ["engagements"] });
    },
    onError: (e) => toastError(e, "sweep_engage.common.failed"),
  });
  const teamConfirmFn = useServerFn(teamConfirmContact);
  const teamConfirmMut = useMutation({
    mutationFn: (id: string) => teamConfirmFn({ data: { engagement_id: id } }),
    onSuccess: () => { toast.success(t("sweep_engage.engagements.contact_confirmed_toast")); qc.invalidateQueries({ queryKey: ["engagements"] }); },
    onError: (e) => toastError(e, "sweep_engage.common.failed"),
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
    onError: (e) => toastError(e, "sweep_engage.common.failed"),
  });


  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page py-12">
        <div className="label-mono">[ENGAGEMENTS]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("engagements.title")}</h1>




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
            // Teams always see their own Pit Call; freelancers must pay the 1-token reveal.
            const detailsUnlocked = !isFreelancer || !!e.revealedByMe;
            return (
              <div key={e.id} id={`engagement-${e.id}`} className={`scroll-mt-24 border p-5 ${targetEngagementId === e.id ? "ring-2 ring-racing-yellow ring-offset-2 ring-offset-background " : ""}${perfect ? "border-racing-yellow bg-racing-yellow/5" : "border-border bg-card"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      {pct !== null && (
                        <div className={`text-2xl font-black italic tracking-tighter ${perfect ? "text-racing-yellow" : "text-racing-red"}`}>
                          {pct}% <span className="font-mono text-[10px] uppercase tracking-widest">{perfect ? t("sweep_engage.matches.perfect_match") : t("sweep_engage.matches.match_label")}</span>
                        </div>
                      )}
                      <div className="font-bold">{isFreelancer ? (tp?.team_name ?? other?.display_name ?? t("sweep_engage.matches.team_fallback")) : (fp?.headline ? `${other?.display_name}` : other?.display_name)}</div>
                    </div>
                    {isFreelancer && tp && (
                      <div className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
                        {tp.team_type && <span>{tp.team_type}</span>}
                        {tp.location && <span> · {tp.location}</span>}
                        {tp.primary_discipline && <span> · {disciplineLabel(tp.primary_discipline)}</span>}
                      </div>
                    )}
                    {isFreelancer && !tp?.team_name && (
                      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {t("sweep_engage.matches.team_name_hidden")}
                      </div>
                    )}

                    {!isFreelancer && fp && (
                      <div className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
                        {fp.role_group && <span>{roleGroupLabel(fp.role_group)}</span>}
                        {fp.location && <span> · {fp.location}</span>}
                        {typeof fp.day_rate === "number" && <span> · €{fp.day_rate}/day</span>}
                      </div>
                    )}
                  </div>
                  <span className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest">
                    {engagementStatusLabel(e.status)}
                  </span>
                </div>

                {e.cancellation_kind === "team_ghosting" && (
                  <div className="mt-3 border border-racing-red bg-racing-red/10 p-3">
                    <div className="label-mono text-racing-red">{t("sweep_engage.engagements.team_no_followup_title")}</div>
                    <p className="mt-1 text-xs">
                      {t("sweep_engage.engagements.team_no_followup_body")}
                    </p>
                  </div>
                )}

                {req && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="label-mono mb-1">[PIT CALL]</div>
                    <div className="text-sm font-bold">{req.title}</div>
                    <div className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
                      {req.sub_role ? subRoleLabel(req.sub_role) : roleGroupLabel(req.role_group)} · {disciplineLabel(req.discipline)} · <PitCallDates request={req} />
                      {detailsUnlocked && (req.budget_min || req.budget_max) && <span> · €{req.budget_min ?? "?"}–{req.budget_max ?? "?"}/{req.budget_unit}</span>}
                    </div>
                    {/* 1-token reveal: unlocks the anonymous Pit Call details. Team identity stays hidden. */}
                    {isFreelancer && !detailsUnlocked && e.match?.id && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 border border-dashed border-border bg-background/40 p-3">
                        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                          {t("matches.hidden_name")}
                        </span>
                        <button
                          onClick={async () => {
                            if (await confirmDialog(t("matches.reveal_confirm", { who: t("nav.teams") }))) revealMut.mutate(e.match.id);
                          }}
                          disabled={revealMut.isPending}
                          className="bg-racing-red px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
                        >
                          {t("matches.reveal_1_token")}
                        </button>
                      </div>
                    )}
                    {detailsUnlocked && (skillsHard.length > 0 || skillsSoft.length > 0) && (
                      <div className="mt-2">
                        <div className="label-mono mb-1">[SKILLS]</div>
                        <div className="flex flex-wrap gap-1">
                          {skillsHard.map((s) => (
                            <span key={`h-${s}`} className="border border-racing-red bg-racing-red/10 px-2 py-0.5 font-mono text-[10px] uppercase text-racing-red">{skillLabel(s)} · hard</span>
                          ))}
                          {skillsSoft.filter((s) => !skillsHard.includes(s)).map((s) => (
                            <span key={`s-${s}`} className="border border-racing-yellow bg-racing-yellow/10 px-2 py-0.5 font-mono text-[10px] uppercase text-racing-yellow">{skillLabel(s)}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {detailsUnlocked && languages.length > 0 && (
                      <div className="mt-2">
                        <div className="label-mono mb-1">[LANGUAGES]</div>
                        <div className="flex flex-wrap gap-1">
                          {languages.map((l: any, i: number) => (
                            <span key={i} className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${l.hard ? "border-racing-red text-racing-red" : "border-border text-muted-foreground"}`}>
                              {languageLabel(l.code, l.custom)} ({languageLevelLabel(l.level)}){l.hard ? " · hard" : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {detailsUnlocked && education.length > 0 && (
                      <div className="mt-2">
                        <div className="label-mono mb-1">[EDUCATION]</div>
                        <div className="flex flex-wrap gap-1">
                          {education.map((ed) => (
                            <span key={ed} className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{educationLabel(ed)}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {detailsUnlocked && req.notes && <p className="mt-2 text-xs text-muted-foreground">{req.notes}</p>}
                  </div>
                )}

                {missing.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="label-mono mb-1">{t("sweep_engage.matches.missing_criteria")}</div>
                    <div className="flex flex-wrap gap-1">
                      {missing.map((c: any, i: number) => (
                        <span key={i} className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${c.hard ? "border-racing-red text-racing-red" : "border-border text-muted-foreground"}`}>
                          {formatCriterion(c, t)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                  <div className="font-mono text-xs text-muted-foreground">
                    <PitCallDates request={req} dates={e.covered_days} /> · {e.currency} {e.fee ?? "—"}
                  </div>
                </div>
                {e.notes && <p className="mt-2 text-sm text-muted-foreground">{e.notes}</p>}
                {(e.status === "confirmed" || e.status === "completed") && (
                  <div className="mt-4 border-t border-border pt-3">
                    {/* Anti-ghosting contact check — freelancer always has the button available
                        for a confirmed engagement until they confirm the team reached out. */}
                    {e.status === "confirmed" && isFreelancer && e.freelancer_contacted !== true && (
                      <div className="mb-4 border border-racing-yellow bg-racing-yellow/10 p-3">
                        <div className="label-mono text-racing-yellow">{t("sweep_engage.engagements.contact_check_title")}</div>
                        <p className="mt-1 text-xs">
                          {e.contact_check_sent_at
                            ? t("sweep_engage.engagements.contact_check_followup")
                            : t("sweep_engage.engagements.contact_check_initial")}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            disabled={answerContactMut.isPending}
                            onClick={() => answerContactMut.mutate({ engagement_id: e.id, contacted: true })}
                            className="bg-racing-red px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-white hover:brightness-110"
                          >
                            {t("sweep_engage.engagements.team_contacted_me")}
                          </button>
                          {e.contact_check_sent_at && (
                            <button
                              disabled={answerContactMut.isPending}
                              onClick={() => answerContactMut.mutate({ engagement_id: e.id, contacted: false })}
                              className="border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
                            >
                              {t("sweep_engage.engagements.not_yet")}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {e.status === "confirmed" && !isFreelancer && !e.team_confirmed_contact && (
                      <div className="mb-4 border border-racing-yellow bg-racing-yellow/10 p-3">
                        <div className="label-mono text-racing-yellow">{t("sweep_engage.engagements.confirm_contacted_title")}</div>
                        <p className="mt-1 text-xs">
                          {t("sweep_engage.engagements.confirm_contacted_body")}
                        </p>
                        <button
                          disabled={teamConfirmMut.isPending}
                          onClick={() => teamConfirmMut.mutate(e.id)}
                          className="mt-2 bg-racing-red px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-white hover:brightness-110"
                        >
                          {t("sweep_engage.engagements.i_contacted_freelancer")}
                        </button>
                      </div>
                    )}
                    {e.status === "confirmed" && !isFreelancer && e.team_reminder2_sent_at && !e.team_confirmed_contact && (
                      <div className="mb-4 border border-racing-red bg-racing-red/10 p-3">
                        <div className="label-mono text-racing-red">{t("sweep_engage.engagements.urgent_contact_title")}</div>
                        <p className="mt-1 text-xs">
                          {t("sweep_engage.engagements.urgent_contact_body")}
                        </p>
                      </div>
                    )}
                    {!isFreelancer && (
                      <div className="mb-4">
                        <div className="label-mono mb-2 text-racing-yellow">{t("sweep_engage.engagements.freelancer_contact_title")}</div>
                        <div className="grid gap-1 text-xs">
                          <div><span className="text-muted-foreground">{t("sweep_engage.engagements.name_label")}:</span> <span className="font-bold">{other?.display_name ?? fp?.headline ?? t("sweep_engage.matches.freelancer_fallback")}</span></div>
                          {e.freelancer_contact?.email && (
                            <div><span className="text-muted-foreground">{t("sweep_engage.engagements.email_label")}:</span> <a href={`mailto:${e.freelancer_contact.email}`} className="font-mono text-racing-red hover:underline">{e.freelancer_contact.email}</a></div>
                          )}
                          {e.freelancer_contact?.phone_number && (
                            <div><span className="text-muted-foreground">{t("sweep_engage.engagements.phone_label")}:</span> <span className="font-mono">{e.freelancer_contact.phone_dial_code ?? ""} {e.freelancer_contact.phone_number}</span></div>
                          )}
                        </div>
                        <div className="mt-2">
                          <ContactQuickButtons
                            contact={{
                              fullName: other?.display_name ?? t("sweep_engage.matches.freelancer_fallback"),
                              organization: fp?.role ? String(fp.role) : undefined,
                              title: fp?.headline ?? undefined,
                              email: e.freelancer_contact?.email ?? undefined,
                              phone: e.freelancer_contact?.phone_number ? `${e.freelancer_contact?.phone_dial_code ?? ""} ${e.freelancer_contact.phone_number}`.trim() : undefined,
                              notes: req?.title ? `PitCall — ${req.title}` : undefined,
                            }}
                          />

                        </div>
                      </div>
                    )}
                    <div className="label-mono mb-2">[ADD TO CALENDAR]</div>
                    <CalendarQuickButtons
                      event={{
                        title: t("sweep_engage.matches.calendar_title", { title: req?.title ?? other?.display_name ?? "PitCall" }),
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
                    <>
                      <MatchRequestDeadline expiresAt={e.expires_at} />
                      <MatchRequestActions
                        engagementId={e.id}
                        expiresAt={e.expires_at}
                        extensionCount={e.extension_count ?? 0}
                        pitcallStart={req?.start_date ?? e.start_date}
                      />
                    </>
                  )}
                  {e.status === "proposed" && e.proposed_by === user?.id && (
                    <>
                      <MatchRequestDeadline expiresAt={e.expires_at} />
                      <button
                        onClick={async () => {
                          if (await confirmDialog(t("engagements.withdraw_confirm", { defaultValue: "Withdraw this request? The freelancer's days will be released." }))) withdrawMut.mutate(e.id);
                        }}
                        disabled={withdrawMut.isPending}
                        className="border border-racing-red px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10 disabled:opacity-60"
                      >
                        {t("engagements.withdraw", { defaultValue: "Withdraw request" })}
                      </button>
                    </>
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
                      ? t("sweep_engage.engagements.cancel_grace_label", { hours: Math.max(0, Math.round((graceEnd! - now) / 3600000)) })
                      : isFreelancer
                      ? t("sweep_engage.engagements.cancel_late_freelancer_label")
                      : t("sweep_engage.engagements.cancel_late_team_label");
                    const warn = inGrace
                      ? t("sweep_engage.engagements.cancel_grace_confirm")
                      : isFreelancer
                      ? t("sweep_engage.engagements.cancel_late_freelancer_confirm")
                      : t("sweep_engage.engagements.cancel_late_team_confirm");
                    return (
                      <button
                        onClick={async () => {
                          if (!await confirmDialog(warn)) return;
                          const reason = window.prompt(t("sweep_engage.engagements.reason_prompt"), "") ?? "";
                          cancelMut.mutate({ engagement_id: e.id, reason: reason.trim() || null });
                        }}
                        className={`px-4 py-2 text-[11px] font-bold uppercase tracking-widest ${inGrace ? "border border-border hover:bg-secondary" : "border border-racing-red text-racing-red hover:bg-racing-red/10"}`}
                      >
                        {label}
                      </button>
                    );
                  })()}

                  {/* Manual, team-only pool add. Never creates an engagement or a rating. */}
                  {!isFreelancer && e.status === "completed" && (
                    e.in_pool || locallyPooled.has(e.id) ? (
                      <span className="inline-flex items-center gap-1 border border-sky-400/60 bg-sky-400/10 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-sky-300">
                        {t("pool.in_my_pool")}
                      </span>
                    ) : (
                      <button
                        onClick={() => addPoolMut.mutate(e.id)}
                        disabled={addPoolMut.isPending}
                        className="border border-sky-400/60 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-sky-300 hover:bg-sky-400/10 disabled:opacity-60"
                      >
                        {t("pool.add_to_my_pool")}
                      </button>
                    )
                  )}


                  {(e.status === "confirmed" || e.status === "completed" || (isFreelancer && e.cancellation_kind === "team_ghosting")) && (() => {
                    const info = ratableMap.get(e.id);
                    const mineRated = ratedMap.get(e.id);
                    const alreadyRated = !!info?.already_rated || !!mineRated || locallySubmittedRatings.has(e.id);
                    const unlocked = !!info?.unlocked || !!mineRated?.unlocked;
                    const now = Date.now();
                    const opensAt = info?.opens_at ? new Date(info.opens_at).getTime() : null;
                    const ghostingUnilateral = isFreelancer && e.cancellation_kind === "team_ghosting";
                    const canRate = (opensAt !== null && now >= opensAt) || ghostingUnilateral;
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
                          {t("rating.opens_on", { date: info?.opens_at ? formatDate(info.opens_at) : "—" })}
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
