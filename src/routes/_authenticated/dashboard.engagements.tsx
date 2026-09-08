import { confirmDialog } from "@/hooks/use-confirm";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RatingPicker } from "@/components/rating-icons";
import { EngagementCard } from "@/components/cards/engagement-card";
import { StatusChip, cardBtn } from "@/components/cards/primitives";
import { getMyEngagements, markEngagementComplete, submitRatingV2, getRatableEngagements, cancelEngagement, freelancerAnswerContact, teamConfirmContact, revealMatch, withdrawMatchConfirmation } from "@/lib/paddock.functions";
import { getPlatformSettings } from "@/lib/admin.functions";
import { addPoolMemberFromEngagement } from "@/lib/pool.functions";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { BackButton } from "@/components/back-button";
import { useDateFormat } from "@/lib/date-locale";
import { toastError } from "@/lib/errors";
import { useActionCosts } from "@/hooks/use-action-costs";

export const Route = createFileRoute("/_authenticated/dashboard/engagements")({
  component: EngagementsPage,
});

function EngagementsPage() {
  const { t } = useTranslation();
  const { formatDate } = useDateFormat();
  const { user } = useAuth();
  const { ratingBonus } = useActionCosts();
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
  const fetchSettings = useServerFn(getPlatformSettings);
  const { data: revealSettings = [] } = useQuery({ queryKey: ["platform-settings"], queryFn: () => fetchSettings() });
  const revealCost = Number((revealSettings as Array<{ key: string; value_num: number }>).find((x) => x.key === "cost_reveal_match")?.value_num ?? 1);
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
        toast.success(
          ratingBonus != null
            ? t("rating.submitted_bonus", { bonus: ratingBonus })
            : t("rating.submitted_bonus_generic"),
        );
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
            const req = e.request;
            const ratingSlot = (e.status === "confirmed" || e.status === "completed" || (isFreelancer && e.cancellation_kind === "team_ghosting")) && (() => {
              const info = ratableMap.get(e.id);
              const mineRated = ratedMap.get(e.id);
              const alreadyRated = !!info?.already_rated || !!mineRated || locallySubmittedRatings.has(e.id);
              const now = Date.now();
              const opensAt = info?.opens_at ? new Date(info.opens_at).getTime() : null;
              const ghostingUnilateral = isFreelancer && e.cancellation_kind === "team_ghosting";
              const canRate = (opensAt !== null && now >= opensAt) || ghostingUnilateral;
              if (alreadyRated) {
                return <StatusChip tone="muted">{t("rating.submitted")}</StatusChip>;
              }
              if (!canRate) {
                return <StatusChip tone="muted">{t("rating.opens_on", { date: info?.opens_at ? formatDate(info.opens_at) : "—" })}</StatusChip>;
              }
              if (ratingFor === e.id) {
                return (
                  <div className="w-full rounded-lg border border-border bg-background p-4">
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
                    <textarea rows={2} value={comment} onChange={(v) => setComment(v.target.value)} placeholder={t("rating.comment_placeholder")} className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" maxLength={500} />
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => rateMut.mutate({ engagement_id: e.id, isFreelancerReviewer: isFreelancer })} className={cardBtn.primary}>{t("rating.submit")}</button>
                      <button onClick={() => setRatingFor(null)} className={cardBtn.ghost}>{t("common.cancel")}</button>
                    </div>
                  </div>
                );
              }
              return (
                <button onClick={() => setRatingFor(e.id)} className={cardBtn.warn}>
                  {t("engagements.rate")}{" "}
                  <span className="ml-1 text-[9px]">
                    {ratingBonus != null ? t("rating.rate_bonus", { bonus: ratingBonus }) : t("rating.rate_bonus_generic")}
                  </span>
                </button>
              );
            })();
            return (
              <EngagementCard
                key={e.id}
                e={e}
                userId={user?.id}
                highlighted={targetEngagementId === e.id}
                ratingSlot={ratingSlot || null}
                actions={{
                  revealCost,
                  revealPending: revealMut.isPending,
                  onReveal: async () => {
                    const who = t("nav.teams"); if (await confirmDialog(revealCost > 0 ? t("matches.reveal_confirm", { count: revealCost, who }) : t("matches.reveal_confirm_free", { who }))) revealMut.mutate(e.match.id);
                  },
                  onWithdraw: async () => {
                    if (await confirmDialog(t("engagements.withdraw_confirm", { defaultValue: "Withdraw this request? The freelancer's days will be released." }))) withdrawMut.mutate(e.id);
                  },
                  withdrawPending: withdrawMut.isPending,
                  onComplete: () => completeMut.mutate(e.id),
                  onCancel: async (inGrace: boolean) => {
                    const warn = inGrace
                      ? t("sweep_engage.engagements.cancel_grace_confirm")
                      : isFreelancer
                      ? t("sweep_engage.engagements.cancel_late_freelancer_confirm")
                      : t("sweep_engage.engagements.cancel_late_team_confirm");
                    if (!await confirmDialog(warn)) return;
                    const reason = window.prompt(t("sweep_engage.engagements.reason_prompt"), "") ?? "";
                    cancelMut.mutate({ engagement_id: e.id, reason: reason.trim() || null });
                  },
                  onAnswerContact: (contacted: boolean) => answerContactMut.mutate({ engagement_id: e.id, contacted }),
                  answerContactPending: answerContactMut.isPending,
                  onTeamConfirmContact: () => teamConfirmMut.mutate(e.id),
                  teamConfirmPending: teamConfirmMut.isPending,
                  onAddToPool: () => addPoolMut.mutate(e.id),
                  addToPoolPending: addPoolMut.isPending,
                  locallyPooled: locallyPooled.has(e.id),
                }}
              />
            );
          })}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
