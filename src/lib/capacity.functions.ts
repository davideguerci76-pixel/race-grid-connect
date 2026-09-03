import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-helpers";
import type { CapacitySnapshot } from "@/lib/capacity";

/**
 * Admin-only, server-authoritative LIVE capacity snapshot.
 * On-demand only — no polling, no cron, no metrics table.
 */
export const adminGetPlatformCapacity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CapacitySnapshot> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readLiveCapacitySnapshot } = await import("@/lib/capacity.server");
    return readLiveCapacitySnapshot(supabaseAdmin);
  });
