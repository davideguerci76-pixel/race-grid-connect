import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PlatformFlags = {
  comingSoon: boolean;
  homeStats: boolean;
  pitcallCreationDisabled: boolean;
};

export const DEFAULT_FLAGS: PlatformFlags = {
  comingSoon: false,
  homeStats: true,
  pitcallCreationDisabled: false,
};

export const FLAG_KEYS = {
  comingSoon: "flag_coming_soon",
  homeStats: "flag_home_stats",
  pitcallCreationDisabled: "flag_pitcall_creation_disabled",
} as const;

/** Public, unauthenticated read of the three launch-control flags. */
export const getPublicFlags = createServerFn({ method: "GET" }).handler(async (): Promise<PlatformFlags> => {
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
        h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client
    .from("platform_settings")
    .select("key, value_num")
    .eq("category", "flags");
  if (error) return DEFAULT_FLAGS;
  const map = new Map((data ?? []).map((r) => [r.key, Number(r.value_num)]));
  const read = (k: string, fallback: boolean) => (map.has(k) ? (map.get(k) ?? 0) > 0 : fallback);
  return {
    comingSoon: read(FLAG_KEYS.comingSoon, DEFAULT_FLAGS.comingSoon),
    homeStats: read(FLAG_KEYS.homeStats, DEFAULT_FLAGS.homeStats),
    pitcallCreationDisabled: read(
      FLAG_KEYS.pitcallCreationDisabled,
      DEFAULT_FLAGS.pitcallCreationDisabled,
    ),
  };
});
