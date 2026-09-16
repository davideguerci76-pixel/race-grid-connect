import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * BLACKLIST-02 — Double-blind private blacklist.
 *
 * Creation is only possible through `create_blocked_pair`, which re-derives the
 * counterparty and the environment from the source engagement server-side and
 * accepts exactly two authorities: a grace cancellation made by the caller, or a
 * no-show engagement on the Team side.
 *
 * Reads are owner-only (RLS). The counterpart identity shown in the list is the
 * identity that was already legitimately revealed by the confirmed engagement:
 * no new SELECT authority and no additional PII is exposed.
 *
 * No endpoint in this module ever answers "is this pair blocked" and removal
 * answers only `{ ok: true }`, so a reverse block stays invisible.
 */

export const createBlockedPair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ engagement_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("create_blocked_pair", {
      _engagement_id: data.engagement_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeBlockedPair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ blocked_user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("remove_blocked_pair", {
      _blocked_user_id: data.blocked_user_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type BlockedPairItem = {
  blocked_user_id: string;
  name: string | null;
  source_kind: string;
  created_at: string;
};

export const getMyBlockedPairs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BlockedPairItem[]> => {
    // RLS restricts this read to the caller's own blocks.
    const { data: rows, error } = await context.supabase
      .from("blocked_pairs")
      .select("blocked_user_id, source_kind, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return [];

    const ids = rows.map((r) => r.blocked_user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles }, { data: teams }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, first_name, last_name, user_type").in("id", ids),
      supabaseAdmin.from("team_profiles").select("user_id, team_name").in("user_id", ids),
    ]);
    const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const teamById = new Map((teams ?? []).map((t: any) => [t.user_id, t.team_name]));

    return rows.map((r) => {
      const p: any = byId.get(r.blocked_user_id);
      const name =
        p?.user_type === "team"
          ? (teamById.get(r.blocked_user_id) ?? p?.display_name ?? null)
          : ([p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.display_name || null);
      return {
        blocked_user_id: r.blocked_user_id,
        name,
        source_kind: r.source_kind as string,
        created_at: r.created_at as string,
      };
    });
  });
