import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-authoritative read of the few token amounts the UI has to *display*.
 * These are the exact same platform_settings rows the RPCs use to charge/reward,
 * so a label can never drift from the real price. No pricing logic lives here:
 * this is a read-only projection, never a second authority.
 */
export type ActionCosts = {
  /** cost_reveal_reviews — used by reveal_reviews() */
  revealReviews: number | null;
  /** cost_reveal_team_full — used by reveal_team() */
  revealTeamFull: number | null;
  /** reward_rating_bonus — awarded by submit_rating_v2() */
  ratingBonus: number | null;
};

const KEYS = {
  revealReviews: "cost_reveal_reviews",
  revealTeamFull: "cost_reveal_team_full",
  ratingBonus: "reward_rating_bonus",
} as const;

export const EMPTY_ACTION_COSTS: ActionCosts = {
  revealReviews: null,
  revealTeamFull: null,
  ratingBonus: null,
};

export const getActionCosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActionCosts> => {
    const { data, error } = await context.supabase
      .from("platform_settings")
      .select("key, value_num")
      .in("key", Object.values(KEYS));
    if (error) return EMPTY_ACTION_COSTS;
    const map = new Map((data ?? []).map((r: any) => [r.key, Number(r.value_num)]));
    const read = (k: string) => (map.has(k) && Number.isFinite(map.get(k)!) ? (map.get(k) as number) : null);
    return {
      revealReviews: read(KEYS.revealReviews),
      revealTeamFull: read(KEYS.revealTeamFull),
      ratingBonus: read(KEYS.ratingBonus),
    };
  });
