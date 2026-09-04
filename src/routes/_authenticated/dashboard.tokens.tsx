import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getTokenHistory } from "@/lib/paddock.functions";
import { listTokenPackages } from "@/lib/token-packages.functions";
import {
  startTokenCheckout,
  getTokenPurchaseAvailability,
  getMyTokenOrderStatus,
  cancelMyTokenOrder,
} from "@/lib/token-checkout.functions";
import { BackButton } from "@/components/back-button";
import { useDateFormat } from "@/lib/date-locale";

export const Route = createFileRoute("/_authenticated/dashboard/tokens")({
  validateSearch: (s: Record<string, unknown>) => ({
    checkout: typeof s["checkout"] === "string" ? (s["checkout"] as string) : undefined,
    order: typeof s["order"] === "string" ? (s["order"] as string) : undefined,
  }),
  component: TokensPage,
});

const eur = (cents: number) => (cents / 100).toFixed(2);

function TokensPage() {
  const { t } = useTranslation();
  const { formatDateTime } = useDateFormat();
  const search = useSearch({ from: "/_authenticated/dashboard/tokens" });
  const queryClient = useQueryClient();

  const getHistory = useServerFn(getTokenHistory);
  const getPackages = useServerFn(listTokenPackages);
  const getAvailability = useServerFn(getTokenPurchaseAvailability);
  const startCheckout = useServerFn(startTokenCheckout);
  const getOrderStatus = useServerFn(getMyTokenOrderStatus);
  const cancelOrder = useServerFn(cancelMyTokenOrder);

  const [busy, setBusy] = useState<string | null>(null);

  const { data: history = [] } = useQuery({ queryKey: ["token-history"], queryFn: () => getHistory() });
  const { data: packages = [] } = useQuery({ queryKey: ["token-packages"], queryFn: () => getPackages() });
  const { data: availability } = useQuery({
    queryKey: ["token-purchase-availability"],
    queryFn: () => getAvailability(),
  });
  const purchaseEnabled = availability?.enabled === true;

  // Return page. It only READS the order; crediting is webhook-only.
  const { data: returnedOrder } = useQuery({
    queryKey: ["token-order", search.order],
    enabled: !!search.order && search.checkout === "success",
    queryFn: () => getOrderStatus({ data: { order_id: search.order! } }),
    refetchInterval: (q) => ((q.state.data as { status?: string } | null)?.status === "credited" ? false : 3000),
  });

  useEffect(() => {
    if (returnedOrder && (returnedOrder as { status?: string }).status === "credited") {
      void queryClient.invalidateQueries({ queryKey: ["token-history"] });
    }
  }, [returnedOrder, queryClient]);

  useEffect(() => {
    if (search.checkout === "cancel" && search.order) {
      void cancelOrder({ data: { order_id: search.order } }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.checkout, search.order]);

  async function onBuy(code: string) {
    setBusy(code);
    try {
      const res = await startCheckout({ data: { package_code: code, origin: window.location.origin } });
      if (res.ok) window.location.href = res.url;
      else setBusy(null);
    } catch {
      setBusy(null);
    }
  }


  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page py-12">
        <div className="label-mono">[TOKENS]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("tokens.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("tokens.sub")}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {packages.map((p) => (
            <div key={p.code} className="border border-border bg-card p-6">
              <div className="label-mono">{t(p.label_key, { defaultValue: p.code })}</div>
              <div className="mt-3 font-mono text-4xl font-black text-racing-red">{p.token_quantity}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t("sweep_profile.tokens.tokens_label")}</div>
              <div className="mt-4 font-mono text-2xl font-bold text-racing-yellow">€ {eur(p.price_cents)}</div>
              {p.savings_cents > 0 && (
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                  −{p.discount_pct}% · € {eur(p.savings_cents)}
                </div>
              )}
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                € {eur(p.effective_price_per_token_cents)} / token
              </div>

              <button
                disabled={!purchaseEnabled || busy !== null}
                onClick={() => void onBuy(p.code)}
                className={
                  purchaseEnabled
                    ? "mt-4 w-full bg-racing-red py-2 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-60"
                    : "mt-4 w-full cursor-not-allowed bg-racing-red/40 py-2 text-xs font-bold uppercase tracking-widest text-white/80 disabled:opacity-60"
                }
              >
                {t("tokens.buy")}
              </button>
              {!purchaseEnabled && (
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  {t("tokens.buy_soon")}
                </p>
              )}

            </div>
          ))}
        </div>

        {search.checkout === "success" && (
          <div className="mt-6 border border-racing-yellow/50 bg-card p-4 font-mono text-sm">
            {(returnedOrder as { status?: string } | null)?.status === "credited"
              ? `+${(returnedOrder as { token_quantity?: number }).token_quantity} tokens credited.`
              : "Payment received. Tokens are being credited…"}
          </div>
        )}
        {search.checkout === "cancel" && (
          <div className="mt-6 border border-border bg-card p-4 font-mono text-sm text-muted-foreground">
            Checkout cancelled. No payment was taken.
          </div>
        )}




        <div className="mt-12">
          <div className="label-mono mb-3">{t("tokens.history")}</div>
          <div className="border border-border bg-card">
            {history.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">—</div>
            ) : (
              <ul className="divide-y divide-border">
                {history.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-4 py-3 font-mono text-sm">
                    <span className="text-muted-foreground">{formatDateTime(r.created_at)} · {t(`tokens.reasons.${r.reason}`)}</span>
                    <span className={r.delta >= 0 ? "text-racing-yellow" : "text-racing-red"}>{r.delta >= 0 ? `+${r.delta}` : r.delta}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
