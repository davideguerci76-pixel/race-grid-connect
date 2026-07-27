import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { RatingIcons } from "@/components/rating-icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getUserRatingSummary, getAnonymousReviews, unlockReviews } from "@/lib/paddock.functions";

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

export function AnonymousReviewsSection({
  targetUserId,
  variant = "wrench",
  isOwner = false,
}: {
  targetUserId: string;
  variant?: Variant;
  isOwner?: boolean;
}) {
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
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const unlocked = !!data?.unlocked || isOwner;

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
            return (
              <li key={i} className="border-b border-border pb-3 last:border-0">
                <div className="flex flex-wrap items-center gap-3">
                  <RatingIcons value={overall} variant={variant} />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t("reviews.anonymous", { defaultValue: "Anonymous" })} · {new Date(r.created_at).toLocaleDateString()}
                  </span>
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
