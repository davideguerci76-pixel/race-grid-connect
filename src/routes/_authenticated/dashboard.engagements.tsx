import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RatingStars } from "@/components/rating-stars";
import { getMyEngagements, confirmEngagement, markEngagementComplete, submitRating, markAllNotificationsRead } from "@/lib/paddock.functions";
import { useAuth } from "@/hooks/use-auth";

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
  const rateFn = useServerFn(submitRating);
  const markRead = useServerFn(markAllNotificationsRead);

  const { data: rows = [] } = useQuery({ queryKey: ["engagements"], queryFn: () => getFn() });

  useEffect(() => {
    markRead().then(() => qc.invalidateQueries({ queryKey: ["unread-notifications"] })).catch(() => {});
  }, [markRead, qc]);
  const [ratingFor, setRatingFor] = useState<string | null>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");

  const confirmMut = useMutation({ mutationFn: (id: string) => confirmFn({ data: { id } }), onSuccess: () => { toast.success("Confirmed"); qc.invalidateQueries(); } });
  const completeMut = useMutation({ mutationFn: (id: string) => completeFn({ data: { id } }), onSuccess: () => { toast.success("Marked complete"); qc.invalidateQueries(); } });
  const rateMut = useMutation({
    mutationFn: (v: { engagement_id: string; to_user_id: string }) => rateFn({ data: { ...v, stars, comment: comment || null } }),
    onSuccess: () => { toast.success(t("rating.submitted")); setRatingFor(null); setComment(""); qc.invalidateQueries(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="label-mono">[ENGAGEMENTS]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("engagements.title")}</h1>

        <div className="mt-8 grid gap-3">
          {rows.length === 0 && <div className="border border-border bg-card p-12 text-center text-sm text-muted-foreground">—</div>}
          {rows.map((e) => {
            const isFreelancer = user?.id === e.freelancer_id;
            const other = isFreelancer ? e.team : e.freelancer;
            const otherId = isFreelancer ? e.team_id : e.freelancer_id;
            const iMarked = isFreelancer ? e.freelancer_marked_complete : e.team_marked_complete;
            return (
              <div key={e.id} className="border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-bold">{other?.display_name}</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">{e.start_date} → {e.end_date} · {e.currency} {e.fee ?? "—"}</div>
                  </div>
                  <span className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest">
                    {t(`engagements.status.${e.status}`)}
                  </span>
                </div>
                {e.notes && <p className="mt-3 text-sm text-muted-foreground">{e.notes}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {e.status === "proposed" && e.proposed_by !== user?.id && (
                    <button onClick={() => confirmMut.mutate(e.id)} className="bg-racing-red px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white hover:brightness-110">
                      {t("engagements.confirm")}
                    </button>
                  )}
                  {e.status === "confirmed" && !iMarked && (
                    <button onClick={() => completeMut.mutate(e.id)} className="bg-foreground px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-background hover:bg-racing-red hover:text-white">
                      {t("engagements.mark_complete")}
                    </button>
                  )}
                  {e.status === "completed" && (
                    ratingFor === e.id ? (
                      <div className="w-full border border-border bg-background p-4">
                        <div className="label-mono mb-2">{t("engagements.rate_them", { name: other?.display_name })}</div>
                        <RatingStars value={stars} onChange={setStars} />
                        <textarea rows={2} value={comment} onChange={(v) => setComment(v.target.value)} placeholder={t("rating.comment_placeholder")} className="mt-3 w-full border border-border bg-background px-3 py-2 text-sm" maxLength={500} />
                        <div className="mt-3 flex gap-2">
                          <button onClick={() => rateMut.mutate({ engagement_id: e.id, to_user_id: otherId })} className="bg-racing-red px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white">{t("rating.submit")}</button>
                          <button onClick={() => setRatingFor(null)} className="border border-border px-4 py-2 text-[11px] font-bold uppercase tracking-widest">{t("common.cancel")}</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setRatingFor(e.id)} className="bg-racing-yellow px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-carbon hover:brightness-110">
                        {t("engagements.rate")}
                      </button>
                    )
                  )}
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
