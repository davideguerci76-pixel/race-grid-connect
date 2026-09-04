import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getTokenHistory } from "@/lib/paddock.functions";
import { listTokenPackages } from "@/lib/token-packages.functions";
import { BackButton } from "@/components/back-button";
import { useDateFormat } from "@/lib/date-locale";

export const Route = createFileRoute("/_authenticated/dashboard/tokens")({
  component: TokensPage,
});

const eur = (cents: number) => (cents / 100).toFixed(2);

function TokensPage() {
  const { t } = useTranslation();
  const { formatDateTime } = useDateFormat();

  const getHistory = useServerFn(getTokenHistory);
  const getPackages = useServerFn(listTokenPackages);

  const { data: history = [] } = useQuery({ queryKey: ["token-history"], queryFn: () => getHistory() });
  const { data: packages = [] } = useQuery({ queryKey: ["token-packages"], queryFn: () => getPackages() });

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

              <button disabled className="mt-4 w-full cursor-not-allowed bg-racing-red/40 py-2 text-xs font-bold uppercase tracking-widest text-white/80 disabled:opacity-60">
                {t("tokens.buy")}
              </button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                {t("tokens.buy_soon")}
              </p>
            </div>
          ))}
        </div>



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
