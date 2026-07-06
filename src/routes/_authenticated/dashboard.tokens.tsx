import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { purchaseTokensDemo, getTokenHistory } from "@/lib/paddock.functions";

const PACKS = [
  { key: "small" as const, tokens: 10, price: "€ 9" },
  { key: "medium" as const, tokens: 50, price: "€ 39" },
  { key: "large" as const, tokens: 200, price: "€ 129" },
];

export const Route = createFileRoute("/_authenticated/dashboard/tokens")({
  component: TokensPage,
});

function TokensPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const purchase = useServerFn(purchaseTokensDemo);
  const getHistory = useServerFn(getTokenHistory);

  const { data: history = [] } = useQuery({ queryKey: ["token-history"], queryFn: () => getHistory() });

  const mut = useMutation({
    mutationFn: (pack: "small" | "medium" | "large") => purchase({ data: { pack } }),
    onSuccess: (r) => { toast.success(`+${r.added} tokens credited (demo)`); qc.invalidateQueries(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Purchase failed"),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="label-mono">[TOKENS]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("tokens.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("tokens.sub")}</p>

        <div className="mt-4 rounded-none border border-racing-yellow/40 bg-racing-yellow/5 p-3 font-mono text-xs text-racing-yellow">
          DEMO MODE: Stripe checkout will replace instant credit once you confirm your seller country.
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PACKS.map((p) => (
            <div key={p.key} className="border border-border bg-card p-6">
              <div className="label-mono">{t(`tokens.packs.${p.key}`)}</div>
              <div className="mt-3 font-mono text-4xl font-black text-racing-red">{p.tokens}</div>
              <div className="mt-1 text-xs text-muted-foreground">tokens</div>
              <div className="mt-4 font-mono text-2xl font-bold text-racing-yellow">{p.price}</div>
              <button onClick={() => mut.mutate(p.key)} disabled={mut.isPending} className="mt-4 w-full bg-racing-red py-2 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60">
                {t("tokens.buy")}
              </button>
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
                    <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()} · {t(`tokens.reasons.${r.reason}`)}</span>
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
