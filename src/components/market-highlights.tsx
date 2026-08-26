import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Activity, CalendarClock, Flame, Users } from "lucide-react";
import { getMarketStats, type MarketDay, type MarketStats } from "@/lib/market.functions";

export function useMarketStats() {
  const fetchStats = useServerFn(getMarketStats);
  return useQuery({
    queryKey: ["market-stats"],
    queryFn: () => fetchStats() as Promise<MarketStats | null>,
    staleTime: 5 * 60_000,
  });
}

export function HotDayRow({ d, tone }: { d: MarketDay; tone: "demand" | "supply" }) {
  const { t } = useTranslation();
  const color = tone === "demand" ? "text-racing-red" : "text-racing-yellow";
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2 last:border-0">
      <span className="font-mono text-xs">{d.day}</span>
      <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {t("market.demand_short")} {d.demand} · {t("market.supply_short")} {d.supply}
      </span>
      <span className={`font-mono text-xs font-black ${color}`}>{d.gap > 0 ? `+${d.gap}` : d.gap}</span>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; value: string }) {
  return (
    <div className="border border-border bg-card p-5">
      <Icon className="size-6 text-racing-red" strokeWidth={1.5} />
      <div className="mt-3 font-mono text-3xl font-black tracking-tighter">{value}</div>
      <div className="label-mono mt-1">{label}</div>
    </div>
  );
}

export function MarketHighlights({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const flags = usePlatformFlags();
  const { data, isLoading } = useMarketStats();
  const totals = data?.totals;

  if (!flags.homeStats) return null;

  return (
    <section className={compact ? "mt-12" : ""}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label-mono">[{t("market.label")}]</div>
          <h2 className={`font-black uppercase italic tracking-tighter ${compact ? "text-2xl" : "text-4xl md:text-5xl"}`}>
            {t("market.highlights_title")}
          </h2>
        </div>
        <Link to="/market" className="border border-border px-4 py-3 text-[11px] font-bold uppercase tracking-widest transition-colors hover:bg-secondary">
          {t("market.see_all")} →
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Activity} label={t("market.total_matches")} value={isLoading ? "—" : String(totals?.total_matches ?? 0)} />
        <Stat icon={CalendarClock} label={t("market.open_pitcalls")} value={isLoading ? "—" : String(totals?.active_requests ?? 0)} />
        <Stat icon={Users} label={t("market.available_specialists")} value={isLoading ? "—" : String(totals?.available_freelancers ?? 0)} />
        <Stat icon={Flame} label={t("market.completed_engagements")} value={isLoading ? "—" : String(totals?.completed_engagements ?? 0)} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="border border-border bg-card p-5">
          <div className="label-mono text-racing-red">{t("market.hot_days_demand")}</div>
          <p className="mt-1 text-xs text-muted-foreground">{t("market.hot_days_demand_hint")}</p>
          <div className="mt-3">
            {(data?.hot_days_demand ?? []).slice(0, compact ? 3 : 6).map((d) => <HotDayRow key={d.day} d={d} tone="demand" />)}
            {!isLoading && (data?.hot_days_demand ?? []).length === 0 && (
              <div className="py-3 font-mono text-xs text-muted-foreground">{t("market.no_data")}</div>
            )}
          </div>
        </div>
        <div className="border border-border bg-card p-5">
          <div className="label-mono text-racing-yellow">{t("market.hot_days_supply")}</div>
          <p className="mt-1 text-xs text-muted-foreground">{t("market.hot_days_supply_hint")}</p>
          <div className="mt-3">
            {(data?.hot_days_supply ?? []).slice(0, compact ? 3 : 6).map((d) => <HotDayRow key={d.day} d={d} tone="supply" />)}
            {!isLoading && (data?.hot_days_supply ?? []).length === 0 && (
              <div className="py-3 font-mono text-xs text-muted-foreground">{t("market.no_data")}</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
