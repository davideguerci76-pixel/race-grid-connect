import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { adminGetMarketStats } from "@/lib/market.functions";

/**
 * ACP-STATS-01 — Always shows the real values of the statistics governed by
 * flag_home_stats, regardless of the public toggle. Same RPC as the public pages.
 */
export function PublicStatsCard({ publicOn }: { publicOn: boolean }) {
  const { t } = useTranslation();
  const get = useServerFn(adminGetMarketStats);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-market-stats"],
    queryFn: () => get(),
    refetchOnWindowFocus: false,
  });
  const s = data?.stats;
  const tt = s?.totals;
  const countries = s ? new Set((s.by_country ?? []).map((c) => c.country).filter(Boolean)).size : undefined;
  const rows: [string, number | undefined][] = [
    [t("home.stats.specialists"), tt?.freelancers],
    [t("home.stats.teams"), tt?.teams],
    [t("home.stats.countries"), countries],
    [t("market.total_matches"), tt?.total_matches],
    [t("market.confirmed_engagements"), tt?.confirmed_engagements],
    [t("market.completed_engagements"), tt?.completed_engagements],
    [t("market.open_pitcalls"), tt?.active_requests],
    [t("market.available_specialists"), tt?.available_freelancers],
    [t("market.open_sos"), tt?.open_sos],
  ];

  return (
    <div className="border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-widest">
          {t("sweep_admin_a.launch.home_stats_title")} <span className="text-muted-foreground">· LIVE</span>
        </div>
        <div className={`text-xs font-black uppercase tracking-widest ${publicOn ? "text-racing-yellow" : "text-muted-foreground"}`}>
          PUBLIC: {publicOn ? "ON" : "OFF"}
        </div>
      </div>
      {isLoading || isError || !s ? (
        <div className="mt-2 text-[11px] text-muted-foreground">{isError ? "unavailable" : "loading…"}</div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rows.map(([label, v]) => (
            <div key={label} className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
              <div className="font-mono text-sm">{(v ?? 0).toLocaleString("en-US")}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
