import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type MarketDay = { day: string; demand: number; supply: number; gap: number };
export type MarketTrend = { month: string; requests: number; matches: number; engagements: number };
export type MarketStats = {
  generated_at: string;
  totals: {
    total_matches: number;
    confirmed_engagements: number;
    completed_engagements: number;
    active_requests: number;
    freelancers: number;
    teams: number;
    available_freelancers: number;
    avg_day_rate: number | null;
    open_sos: number;
  };
  hot_days_demand: MarketDay[];
  hot_days_supply: MarketDay[];
  trend: MarketTrend[];
  top_disciplines: { discipline: string; requests: number }[];
  top_role_groups: { role_group: string; requests: number }[];
};

export const getMarketStats = createServerFn({ method: "GET" }).handler(async (): Promise<MarketStats | null> => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client.rpc("market_stats" as never);
  if (error) throw new Error(error.message);
  return (data as unknown as MarketStats) ?? null;
});
