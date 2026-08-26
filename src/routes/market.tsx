import { lazy, Suspense } from "react";
import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HotDayRow, useMarketStats } from "@/components/market-highlights";
import { usePlatformFlags } from "@/hooks/use-platform-flags";

const MarketWorldMap = lazy(() => import("@/components/market-world-map"));

export const Route = createFileRoute("/market")({
  head: () => ({
    meta: [
      { title: "Motorsport Market Data — Pit Call" },
      { name: "description", content: "Live motorsport freelance market data: match volume, open Pit Calls, hot days, day-rate trends and demand by discipline." },
      { property: "og:title", content: "Motorsport Market Data — Pit Call" },
      { property: "og:description", content: "Aggregated market intelligence for motorsport teams and freelancers: matches, hot days, trends and demand by discipline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarketPage,
});

function Bar({ value, max, label, sub }: { value: number; max: number; label: string; sub?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="py-2">
      <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest">
        <span>{label}</span>
        <span className="text-muted-foreground">{sub ?? value}</span>
      </div>
      <div className="mt-1 h-2 w-full bg-secondary">
        <div className="h-full bg-racing-red" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MarketPage() {
  const { t } = useTranslation();
  const flags = usePlatformFlags();
  const { data: rawStats, isLoading } = useMarketStats();
  const data = flags.homeStats ? rawStats : undefined;
  const totals = data?.totals;
  const trend = data?.trend ?? [];
  const maxTrend = Math.max(1, ...trend.map((m) => Math.max(m.requests, m.matches, m.engagements)));
  const maxDisc = Math.max(1, ...(data?.top_disciplines ?? []).map((d) => d.requests));
  const maxRole = Math.max(1, ...(data?.top_role_groups ?? []).map((d) => d.requests));
  const countries = data?.by_country ?? [];
  const maxCountryDemand = Math.max(1, ...countries.map((c) => c.demand));
  const maxCountrySupply = Math.max(1, ...countries.map((c) => c.supply));

  if (!flags.homeStats) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <SiteHeader />
        <div className="container-page flex flex-1 flex-col items-center justify-center py-24 text-center">
          <div className="label-mono">[{t("market.label")}]</div>
          <h1 className="mt-2 text-4xl font-black uppercase italic tracking-tighter">{t("market.page_title")}</h1>
          <p className="mt-4 max-w-md text-muted-foreground">{t("market.no_data")}</p>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="label-mono">[{t("market.label")}]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter md:text-6xl">{t("market.page_title")}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">{t("market.page_sub")}</p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [t("market.total_matches"), totals?.total_matches],
            [t("market.confirmed_engagements"), totals?.confirmed_engagements],
            [t("market.completed_engagements"), totals?.completed_engagements],
            [t("market.open_pitcalls"), totals?.active_requests],
            [t("market.specialists"), totals?.freelancers],
            [t("market.teams"), totals?.teams],
            [t("market.available_specialists"), totals?.available_freelancers],
            [t("market.open_sos"), totals?.open_sos],
          ].map(([label, value]) => (
            <div key={String(label)} className="border border-border bg-card p-5">
              <div className="font-mono text-3xl font-black tracking-tighter text-racing-red">
                {isLoading ? "—" : String(value ?? 0)}
              </div>
              <div className="label-mono mt-2">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="border border-border bg-card p-5">
            <div className="label-mono text-racing-red">{t("market.hot_days_demand")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("market.hot_days_demand_hint")}</p>
            <div className="mt-3">
              {(data?.hot_days_demand ?? []).map((d) => <HotDayRow key={d.day} d={d} tone="demand" />)}
              {!isLoading && (data?.hot_days_demand ?? []).length === 0 && (
                <div className="py-3 font-mono text-xs text-muted-foreground">{t("market.no_data")}</div>
              )}
            </div>
          </div>
          <div className="border border-border bg-card p-5">
            <div className="label-mono text-racing-yellow">{t("market.hot_days_supply")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("market.hot_days_supply_hint")}</p>
            <div className="mt-3">
              {(data?.hot_days_supply ?? []).map((d) => <HotDayRow key={d.day} d={d} tone="supply" />)}
              {!isLoading && (data?.hot_days_supply ?? []).length === 0 && (
                <div className="py-3 font-mono text-xs text-muted-foreground">{t("market.no_data")}</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="border border-border bg-card p-5 md:col-span-3">
            <div className="label-mono">{t("market.trend_title")}</div>
            <div className="mt-3 grid gap-6 md:grid-cols-3">
              {(["requests", "matches", "engagements"] as const).map((k) => (
                <div key={k}>
                  <div className="font-mono text-[11px] uppercase tracking-widest text-racing-red">{t(`market.trend_${k}`)}</div>
                  {trend.map((m) => (
                    <Bar key={m.month} label={m.month} value={m[k]} max={maxTrend} />
                  ))}
                  {trend.length === 0 && <div className="py-3 font-mono text-xs text-muted-foreground">{t("market.no_data")}</div>}
                </div>
              ))}
            </div>
          </div>

          <div className="border border-border bg-card p-5">
            <div className="label-mono">{t("market.top_disciplines")}</div>
            <div className="mt-3">
              {(data?.top_disciplines ?? []).map((d) => (
                <Bar key={d.discipline} label={d.discipline.replace(/_/g, " ")} value={d.requests} max={maxDisc} />
              ))}
              {!isLoading && (data?.top_disciplines ?? []).length === 0 && (
                <div className="py-3 font-mono text-xs text-muted-foreground">{t("market.no_data")}</div>
              )}
            </div>
          </div>

          <div className="border border-border bg-card p-5 md:col-span-2">
            <div className="label-mono">{t("market.top_roles")}</div>
            <div className="mt-3">
              {(data?.top_role_groups ?? []).map((d) => (
                <Bar key={d.role_group} label={d.role_group.replace(/_/g, " ")} value={d.requests} max={maxRole} />
              ))}
              {!isLoading && (data?.top_role_groups ?? []).length === 0 && (
                <div className="py-3 font-mono text-xs text-muted-foreground">{t("market.no_data")}</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-10">
          <div className="label-mono">{t("market.geo_label")}</div>
          <h2 className="text-2xl font-black uppercase italic tracking-tighter md:text-3xl">{t("market.geo_title")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("market.geo_sub")}</p>

          <div className="mt-4">
            <ClientOnly fallback={<div className="h-[420px] w-full border border-border bg-card" />}>
              <Suspense fallback={<div className="h-[420px] w-full border border-border bg-card" />}>
                <MarketWorldMap
                  countries={countries}
                  labels={{ demand: t("market.geo_demand"), supply: t("market.geo_supply"), teams: t("market.teams") }}
                />
              </Suspense>
            </ClientOnly>
            <div className="mt-2 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span><span className="mr-1 inline-block size-2 bg-racing-red align-middle" />{t("market.geo_legend_demand")}</span>
              <span><span className="mr-1 inline-block size-2 bg-racing-yellow align-middle" />{t("market.geo_legend_supply")}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="border border-border bg-card p-5">
              <div className="label-mono text-racing-red">{t("market.geo_demand_by_country")}</div>
              <div className="mt-3">
                {[...countries].sort((a, b) => b.demand - a.demand).slice(0, 10).map((c) => (
                  <Bar key={`d-${c.country}`} label={c.country} value={c.demand} max={maxCountryDemand} />
                ))}
                {!isLoading && countries.length === 0 && (
                  <div className="py-3 font-mono text-xs text-muted-foreground">{t("market.no_data")}</div>
                )}
              </div>
            </div>
            <div className="border border-border bg-card p-5">
              <div className="label-mono text-racing-yellow">{t("market.geo_supply_by_country")}</div>
              <div className="mt-3">
                {[...countries].sort((a, b) => b.supply - a.supply).slice(0, 10).map((c) => (
                  <Bar key={`s-${c.country}`} label={c.country} value={c.supply} max={maxCountrySupply} />
                ))}
                {!isLoading && countries.length === 0 && (
                  <div className="py-3 font-mono text-xs text-muted-foreground">{t("market.no_data")}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {data?.generated_at && (
          <div className="mt-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("market.updated")} {new Date(data.generated_at).toLocaleString()}
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
