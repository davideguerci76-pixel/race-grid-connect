import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldOff, Ban } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BackButton } from "@/components/back-button";
import { confirmDialog } from "@/hooks/use-confirm";
import { cardBtn } from "@/components/cards/primitives";
import { useDateFormat } from "@/lib/date-locale";
import { toastError } from "@/lib/errors";
import { getMyBlockedPairs, removeBlockedPair, type BlockedPairItem } from "@/lib/blacklist.functions";

export const Route = createFileRoute("/_authenticated/dashboard/blacklist")({
  component: BlacklistPage,
  head: () => ({
    meta: [
      { title: "Private blacklist — PITCALL" },
      { name: "description", content: "Review and remove the private, double-blind blocks you created on PITCALL." },
      { property: "og:title", content: "Private blacklist — PITCALL" },
      { property: "og:description", content: "Review and remove the private, double-blind blocks you created on PITCALL." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function BlacklistPage() {
  const { t } = useTranslation();
  const { formatDate } = useDateFormat();
  const qc = useQueryClient();
  const listFn = useServerFn(getMyBlockedPairs);
  const removeFn = useServerFn(removeBlockedPair);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["my-blacklist"],
    queryFn: () => listFn(),
  });

  const removeMut = useMutation({
    mutationFn: (blocked_user_id: string) => removeFn({ data: { blocked_user_id } }),
    onSuccess: () => {
      toast.success(t("blacklist.removed"));
      qc.invalidateQueries({ queryKey: ["my-blacklist"] });
    },
    onError: (e) => toastError(e, "blacklist.remove_failed"),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page py-12">
        <div className="label-mono">[BLACKLIST]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("blacklist.title")}</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{t("blacklist.intro")}</p>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("blacklist.double_blind")}</p>

        <div className="mt-8 grid gap-3">
          {!isLoading && (rows as BlockedPairItem[]).length === 0 && (
            <div className="border border-border bg-card p-12 text-center text-sm text-muted-foreground">
              {t("blacklist.empty")}
            </div>
          )}
          {(rows as BlockedPairItem[]).map((r) => (
            <div key={r.blocked_user_id} className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <ShieldOff className="mt-0.5 size-5 text-racing-red" strokeWidth={1.5} />
                <div>
                  <div className="text-lg font-bold">{r.name ?? t("blacklist.unknown_counterpart")}</div>
                  <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    {r.source_kind === "no_show" ? t("blacklist.source_no_show") : t("blacklist.source_cancel_grace")}
                    {" · "}
                    {t("blacklist.since", { date: formatDate(r.created_at) })}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={cardBtn.danger}
                disabled={removeMut.isPending}
                onClick={async () => {
                  if (await confirmDialog(t("blacklist.remove_confirm"))) removeMut.mutate(r.blocked_user_id);
                }}
              >
                <Ban className="size-3.5" /> {t("blacklist.remove")}
              </button>
            </div>
          ))}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
