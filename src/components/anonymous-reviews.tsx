import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, Flag } from "lucide-react";
import { RatingIcons } from "@/components/rating-icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getUserRatingSummary, getAnonymousReviews, unlockReviews, flagRating } from "@/lib/paddock.functions";
import { useDateFormat } from "@/lib/date-locale";
import { toastError } from "@/lib/errors";

type Variant = "wrench" | "headset";

export function ProfileRatingBadge({
  userId,
  variant = "wrench",
  isOwner = false,
}: {
  userId: string;
  variant?: Variant;
  isOwner?: boolean;
}) {
  const { t } = useTranslation();
  const getSummary = useServerFn(getUserRatingSummary);
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["rating-summary", userId],
    queryFn: () => getSummary({ data: { user_id: userId } }),
  });
  if (!data || !data.count) return null;
  const icons = <RatingIcons value={data.average} count={data.count} variant={variant} />;
  if (!isOwner) return icons;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer transition hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-racing-yellow"
        title={t("reviews.view_mine", { defaultValue: "View my reviews" }) as string}
      >
        {icons}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-xs uppercase tracking-widest text-racing-red">
              {t("reviews.my_reviews", { defaultValue: "Reviews received" })}
            </DialogTitle>
          </DialogHeader>
          <AnonymousReviewsSection targetUserId={userId} variant={variant} isOwner />
        </DialogContent>
      </Dialog>
    </>
  );
}

function FlagReviewButton({ ratingId, alreadyFlagged, onFlagged }: { ratingId: string; alreadyFlagged: boolean; onFlagged: () => void }) {
  const { t } = useTranslation();
  const flagFn = useServerFn(flagRating);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: () => flagFn({ data: { rating_id: ratingId, reason: reason.trim() } }),
    onSuccess: () => {
      toast.success(t("reviews.flag_submitted", { defaultValue: "Review reported. Our team will review it." }));
      setOpen(false);
      setReason("");
      onFlagged();
    },
    onError: (e: any) => toastError(e),
  });

  if (alreadyFlagged) {
    return (
      <span className="inline-flex items-center gap-1 border border-racing-red/40 bg-racing-red/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-racing-red">
        <Flag className="size-3" />
        {t("reviews.flag_pending", { defaultValue: "Reported" })}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:border-racing-red hover:text-racing-red"
      >
        <Flag className="size-3" />
        {t("reviews.flag_cta", { defaultValue: "Report / Contest" })}
      </button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setReason(""); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-xs uppercase tracking-widest text-racing-red">
              {t("reviews.flag_title", { defaultValue: "Contest this review" })}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("reviews.flag_help", {
              defaultValue:
                "Explain why this review looks unfair, off-topic, or abusive. Your report goes to our moderation team.",
            })}
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reviews.flag_placeholder", { defaultValue: "Describe the issue (min. 10 characters)…" }) as string}
            rows={5}
            maxLength={2000}
            className="mt-2"
          />
          <div className="text-right font-mono text-[10px] text-muted-foreground">{reason.length}/2000</div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="border border-border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="button"
              onClick={() => mut.mutate()}
              disabled={mut.isPending || reason.trim().length < 10}
              className="bg-racing-red px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
            >
              {mut.isPending
                ? t("common.loading")
                : t("reviews.flag_submit", { defaultValue: "Submit report" })}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AnonymousReviewsSection({
  targetUserId,
  variant = "wrench",
  isOwner = false,
}: {
  targetUserId: string;
  variant?: Variant;
  isOwner?: boolean;
}) {
  const { formatDate } = useDateFormat();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const getReviews = useServerFn(getAnonymousReviews);
  const unlockFn = useServerFn(unlockReviews);

  const { data, isLoading } = useQuery({
    queryKey: ["anon-reviews", targetUserId],
    queryFn: () => getReviews({ data: { target_user_id: targetUserId } }),
  });

  const unlock = useMutation({
    mutationFn: () => unlockFn({ data: { target_user_id: targetUserId } }),
    onSuccess: () => {
      toast.success(t("reviews.unlocked_toast", { defaultValue: "Reviews unlocked" }));
      qc.invalidateQueries({ queryKey: ["anon-reviews", targetUserId] });
      qc.invalidateQueries({ queryKey: ["dashboard-profile"] });
    },
    onError: (e: any) => toastError(e),
  });

  const unlocked = !!data?.unlocked || isOwner;

  const refetchReviews = () => qc.invalidateQueries({ queryKey: ["anon-reviews", targetUserId] });

  return (
    <div className="border border-border bg-card p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="label-mono">{t("reviews.title", { defaultValue: "Reviews" })}</div>
        {!unlocked && (
          <button
            onClick={() => unlock.mutate()}
            disabled={unlock.isPending}
            className="bg-racing-red px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
          >
            {unlock.isPending
              ? t("common.loading")
              : t("reviews.unlock_cta", { defaultValue: "Unlock reviews (1 token)" })}
          </button>
        )}
      </div>

      {!unlocked ? (
        <div className="flex items-center gap-3 border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Lock className="size-4" />
          <span>
            {t("reviews.locked_hint", {
              defaultValue:
                "Individual reviews are hidden. Spend 1 token to read the anonymous review list — authors are never revealed.",
            })}
          </span>
        </div>
      ) : isLoading ? (
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : (data?.reviews?.length ?? 0) === 0 ? (
        <div className="text-sm text-muted-foreground">{t("rating.no_ratings", { defaultValue: "No reviews yet." })}</div>
      ) : (
        <ul className="space-y-4">
          {data!.reviews.map((r: any, i: number) => {
            const sub = r.sub_scores ?? {};
            const overall = r.overall != null ? Number(r.overall) : Number(r.stars ?? 0);
            const status = r.moderation_status ?? "active";
            const alreadyFlagged = status === "flagged" || status === "frozen";
            return (
              <li key={r.id ?? i} className="border-b border-border pb-3 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <RatingIcons value={overall} variant={variant} />
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t("reviews.anonymous", { defaultValue: "Anonymous" })} · {formatDate(r.created_at)}
                    </span>
                  </div>
                  {r.id && (
                    <FlagReviewButton ratingId={r.id} alreadyFlagged={alreadyFlagged} onFlagged={refetchReviews} />
                  )}
                </div>
                {variant === "wrench" && (sub.technical || sub.punctuality || sub.stress) && (
                  <div className="mt-2 grid gap-1 sm:grid-cols-3">
                    {sub.technical != null && (
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-muted-foreground">{t("rating.technical", { defaultValue: "Technical" })}</span>
                        <RatingIcons value={Number(sub.technical)} variant="wrench" size={14} showNumber />
                      </div>
                    )}
                    {sub.punctuality != null && (
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-muted-foreground">{t("rating.punctuality", { defaultValue: "Punctuality" })}</span>
                        <RatingIcons value={Number(sub.punctuality)} variant="wrench" size={14} showNumber />
                      </div>
                    )}
                    {sub.stress != null && (
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-muted-foreground">{t("rating.stress", { defaultValue: "Stress" })}</span>
                        <RatingIcons value={Number(sub.stress)} variant="wrench" size={14} showNumber />
                      </div>
                    )}
                  </div>
                )}
                {r.comment && <div className="mt-2 text-sm text-muted-foreground">"{r.comment}"</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
