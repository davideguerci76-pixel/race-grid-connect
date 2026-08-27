import { confirmDialog } from "@/hooks/use-confirm";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Flag, Snowflake, Trash2, Check, X } from "lucide-react";
import { adminListRatings, adminModerateRating } from "@/lib/admin.functions";
import { RatingIcons } from "@/components/rating-icons";
import { useDateFormat } from "@/lib/date-locale";
import { useTranslation } from "react-i18next";
import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  component: AdminReviews,
});

type Filter = "all" | "flagged" | "frozen" | "auto_suspicious";

function AdminReviews() {
  const { t } = useTranslation();
  const { formatDate } = useDateFormat();
  const listFn = useServerFn(adminListRatings);
  const modFn = useServerFn(adminModerateRating);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("flagged");
  const [detail, setDetail] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-ratings", filter],
    queryFn: () => listFn({ data: { filter } }),
  });

  const mut = useMutation({
    mutationFn: (v: { rating_id: string; action: "freeze" | "delete" | "approve" }) =>
      modFn({ data: v }),
    onSuccess: (_r, v) => {
      const map: Record<string, string> = {
        freeze: t("sweep_admin_b.reviews.rating_frozen"),
        delete: t("sweep_admin_b.reviews.rating_deleted"),
        approve: t("sweep_admin_b.reviews.rating_approved"),
      };
      toast.success(map[v.action]);
      qc.invalidateQueries({ queryKey: ["admin-ratings"] });
      qc.invalidateQueries({ queryKey: ["admin-freelancers"] });
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
    },
    onError: (e: any) => toastError(e, "sweep_admin_b.common.failed"),
  });

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: t("sweep_admin_b.reviews.filter_all") },
    { key: "flagged", label: t("sweep_admin_b.reviews.filter_flagged") },
    { key: "frozen", label: t("sweep_admin_b.reviews.filter_frozen") },
    { key: "auto_suspicious", label: t("sweep_admin_b.reviews.filter_auto_suspicious") },
  ];

  const rows = (data ?? []) as any[];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors ${
              filter === f.key
                ? "border-racing-red bg-racing-red/10 text-racing-red"
                : "border-border hover:bg-secondary"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto text-xs text-muted-foreground">{t("sweep_admin_b.reviews.ratings_count", { count: rows.length })}</div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("sweep_admin_b.common.loading")}</div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("sweep_admin_b.reviews.no_match")}
        </div>
      ) : (
        <div className="overflow-auto border border-border">
          <table className="w-full min-w-[1100px] text-xs">
            <thead className="bg-secondary text-[10px] font-bold uppercase tracking-widest">
              <tr>
                <th className="px-2 py-2 text-left">{t("sweep_admin_b.reviews.col_date")}</th>
                <th className="px-2 py-2 text-left">{t("sweep_admin_b.reviews.col_from_to")}</th>
                <th className="px-2 py-2 text-left">{t("sweep_admin_b.reviews.col_engagement")}</th>
                <th className="px-2 py-2 text-left">{t("sweep_admin_b.reviews.col_rating")}</th>
                <th className="px-2 py-2 text-left">{t("sweep_admin_b.reviews.col_comment")}</th>
                <th className="px-2 py-2 text-left">{t("sweep_admin_b.reviews.col_status")}</th>
                <th className="px-2 py-2 text-right">{t("sweep_admin_b.reviews.col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const overall = Number(r.overall ?? r.stars ?? 0);
                const from = r.from_profile;
                const to = r.to_profile;
                const variant = to?.user_type === "team" ? "headset" : "wrench";
                const badge =
                  r.moderation_status === "flagged"
                    ? "border-racing-red text-racing-red bg-racing-red/10"
                    : r.moderation_status === "frozen"
                    ? "border-racing-yellow text-racing-yellow bg-racing-yellow/10"
                    : r.moderation_status === "approved"
                    ? "border-emerald-500 text-emerald-500 bg-emerald-500/10"
                    : "border-border text-muted-foreground";
                return (
                  <tr key={r.id} className="border-t border-border/60 align-top hover:bg-secondary/40">
                    <td className="px-2 py-2 font-mono text-[10px] text-muted-foreground">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-2 py-2">
                      <div>{from?.display_name ?? "—"} <span className="text-muted-foreground">({from?.user_type ?? "?"})</span></div>
                      <div className="text-muted-foreground">→ {to?.display_name ?? "—"} <span className="opacity-70">({to?.user_type ?? "?"})</span></div>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{r.engagement?.request?.title ?? "—"}</td>
                    <td className="px-2 py-2">
                      <RatingIcons value={overall} variant={variant} size={14} />
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      <button
                        onClick={() => setDetail(r)}
                        className="max-w-[240px] truncate text-left underline decoration-dotted underline-offset-2 hover:text-foreground"
                        title={t("sweep_admin_b.reviews.open_full", { defaultValue: "Open full review" })}
                      >
                        {r.comment || t("sweep_admin_b.reviews.open_full", { defaultValue: "Open full review" })}
                      </button>
                      {r.flag_reason && (
                        <div className="mt-1 max-w-[240px] border-l-2 border-racing-red pl-2 text-[11px] italic text-racing-red">
                          "{r.flag_reason}"
                        </div>
                      )}
                    </td>

                    <td className="px-2 py-2">
                      <span className={`inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${badge}`}>
                        {r.moderation_status === "flagged" && <Flag className="size-3" />}
                        {r.moderation_status}
                      </span>
                      {r.auto_suspicious && (
                        <div className="mt-1 inline-flex items-center gap-1 border border-racing-yellow bg-racing-yellow/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-racing-yellow">
                          {t("sweep_admin_b.reviews.auto_suspicious")}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          onClick={() => mut.mutate({ rating_id: r.id, action: "freeze" })}
                          disabled={mut.isPending || r.moderation_status === "frozen"}
                          className="inline-flex items-center gap-1 border border-racing-yellow px-2 py-1 font-mono text-[10px] font-bold uppercase text-racing-yellow hover:bg-racing-yellow/10 disabled:opacity-50"
                        >
                          <Snowflake className="size-3" /> {t("sweep_admin_b.reviews.freeze")}
                        </button>
                        <button
                          onClick={() => mut.mutate({ rating_id: r.id, action: "approve" })}
                          disabled={mut.isPending || r.moderation_status === "approved"}
                          className="inline-flex items-center gap-1 border border-emerald-500 px-2 py-1 font-mono text-[10px] font-bold uppercase text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50"
                        >
                          <Check className="size-3" /> {t("sweep_admin_b.reviews.approve")}
                        </button>
                        <button
                          onClick={() => {
                            if (await confirmDialog(t("sweep_admin_b.reviews.confirm_delete"))) {
                              mut.mutate({ rating_id: r.id, action: "delete" });
                            }
                          }}
                          disabled={mut.isPending}
                          className="inline-flex items-center gap-1 border border-racing-red px-2 py-1 font-mono text-[10px] font-bold uppercase text-racing-red hover:bg-racing-red/10 disabled:opacity-50"
                        >
                          <Trash2 className="size-3" /> {t("sweep_admin_b.reviews.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/70 p-4" onClick={() => setDetail(null)}>
          <div className="mt-10 w-full max-w-2xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-racing-red">[REVIEW DETAIL]</div>
                <h2 className="text-xl font-black uppercase italic tracking-tighter">
                  {detail.from_profile?.display_name ?? "—"} → {detail.to_profile?.display_name ?? "—"}
                </h2>
                <p className="font-mono text-[11px] text-muted-foreground">{formatDate(detail.created_at)}</p>
              </div>
              <button onClick={() => setDetail(null)} className="border border-border p-1 hover:bg-secondary"><X className="size-4" /></button>
            </div>
            <div className="mb-4 flex items-center gap-3">
              <RatingIcons value={Number(detail.overall ?? detail.stars ?? 0)} variant={detail.to_profile?.user_type === "team" ? "headset" : "wrench"} size={18} />
              <span className="font-mono text-sm font-bold">{Number(detail.overall ?? detail.stars ?? 0).toFixed(2)}</span>
              <span className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{detail.moderation_status}</span>
            </div>
            {detail.sub_scores && Object.keys(detail.sub_scores).length > 0 && (
              <div className="mb-4 grid grid-cols-3 gap-2">
                {Object.entries(detail.sub_scores as Record<string, any>).map(([k, v]) => (
                  <div key={k} className="border border-border p-2">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{k}</div>
                    <div className="font-mono text-lg font-black">{String(v)}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mb-4 border border-border bg-secondary/30 p-3 text-sm leading-relaxed whitespace-pre-wrap">
              {detail.comment || "—"}
            </div>
            {detail.flag_reason && (
              <div className="mb-4 border-l-2 border-racing-red bg-racing-red/5 p-3 text-sm italic text-racing-red">
                {detail.flag_reason}
              </div>
            )}
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div>Pit Call: <span className="text-foreground">{detail.engagement?.request?.title ?? "—"}</span></div>
              <div>Engagement: <span className="font-mono">{detail.engagement_id ?? "—"}</span></div>
              <div>Unlocked at: <span className="font-mono">{detail.unlocked_at ? formatDate(detail.unlocked_at) : "—"}</span></div>
              <div>Auto suspicious: <span className="font-mono">{detail.auto_suspicious ? "yes" : "no"}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
