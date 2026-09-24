import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-helpers";

/** Single post-processing shared by public and ACP reads (same source of truth: market_stats RPC). */
function shapeMarketStats(data: unknown): MarketStats | null {
  if (!data) return null;
  const stats = data as MarketStats & { totals: Record<string, unknown> };
  // Average day rate is admin-only: never expose it on public market pages.
  if (stats?.totals) delete stats.totals["avg_day_rate"];
  return stats;
}

export type MarketDay = { day: string; demand: number; supply: number; gap: number };
export type MarketCountry = { country: string; demand: number; supply: number; teams: number; gap: number; lat: number | null; lng: number | null };
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
    open_sos: number;
  };
  hot_days_demand: MarketDay[];
  hot_days_supply: MarketDay[];
  trend: MarketTrend[];
  top_disciplines: { discipline: string; requests: number }[];
  top_role_groups: { role_group: string; requests: number }[];
  by_country: MarketCountry[];
};

// NOTE: always return an object wrapper — a bare `null` from a server fn
// produces an empty response and a 500 in the Start handler.
export const getMarketStats = createServerFn({ method: "GET" }).handler(async (): Promise<{ stats: MarketStats | null }> => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(
          typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
        );
        if (init?.headers) new Headers(init.headers).forEach((v, k2) => h.set(k2, v));
        // Public market stats are anon-only: never forward a caller JWT
        // (a skewed/expired user token makes PostgREST reject the request).
        h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  // Global admin kill-switch: no metrics leave the server when stats are off.
  const { data: flagRows } = await client
    .from("platform_settings")
    .select("key, value_num")
    .eq("key", "flag_home_stats")
    .maybeSingle();
  if (flagRows && Number(flagRows.value_num) <= 0) return { stats: null };
  const { data, error } = await client.rpc("market_stats" as never);
  if (error) throw new Error(error.message);
  return { stats: shapeMarketStats(data) };
});

/**
 * ACP-STATS-01 — Admin-only read of the SAME market_stats RPC, independent of
 * flag_home_stats. Returns exactly what the public would see if the toggle were ON.
 */
export const adminGetMarketStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ stats: MarketStats | null }> => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("market_stats" as never);
    if (error) throw new Error(error.message);
    return { stats: shapeMarketStats(data) };
  });
