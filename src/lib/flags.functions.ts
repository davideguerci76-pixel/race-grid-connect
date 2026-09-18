import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PlatformFlags = {
  comingSoon: boolean;
  homeStats: boolean;
  homePreopeningClaim: boolean;
  pitcallCreationDisabled: boolean;
  /** TOKEN-FL-02 — presentation-only gate for the Freelancer token UX. */
  freelancerTokenVisibility: boolean;
};

export const DEFAULT_FLAGS: PlatformFlags = {
  comingSoon: false,
  homeStats: true,
  homePreopeningClaim: true,
  pitcallCreationDisabled: false,
  // Fail-safe: when the settings read fails, the Freelancer token UX stays hidden.
  freelancerTokenVisibility: false,
};

export const FLAG_KEYS = {
  comingSoon: "flag_coming_soon",
  homeStats: "flag_home_stats",
  homePreopeningClaim: "flag_home_preopening_claim",
  pitcallCreationDisabled: "flag_pitcall_creation_disabled",
  /** Launch gate: master authority for token purchases (TEST and LIVE). Admin-only, not exposed publicly. */
  tokenPurchases: "flag_token_purchase_enabled",
  /** TOKEN-FL-02 — UX exposure of the token economy to Freelancers. Never read by any economic authority. */
  freelancerTokenVisibility: "flag_freelancer_token_visibility",
  /** OPS-BOARD-02B — emission of the aggregated Admin onboarding digest. Never gates signup. */
  adminOnboardingDigest: "flag_admin_onboarding_digest",
} as const;

/** Public, unauthenticated read of the launch-control flags used by public pages. */
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
    homePreopeningClaim: read(
      FLAG_KEYS.homePreopeningClaim,
      DEFAULT_FLAGS.homePreopeningClaim,
    ),
    pitcallCreationDisabled: read(
      FLAG_KEYS.pitcallCreationDisabled,
      DEFAULT_FLAGS.pitcallCreationDisabled,
    ),
    freelancerTokenVisibility: read(
      FLAG_KEYS.freelancerTokenVisibility,
      DEFAULT_FLAGS.freelancerTokenVisibility,
    ),
  };
});
