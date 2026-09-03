import { buildCapacitySnapshot, type CapacitySnapshot } from "@/lib/capacity";

/**
 * LIVE-only capacity counters. Head-only counts, never TEST data, never lists,
 * never personal data. Independent from admin_env_state on purpose.
 */
export async function readLiveCapacitySnapshot(supabaseAdmin: any): Promise<CapacitySnapshot> {
  const [freelancers, teams, activePitCalls] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_test", false)
      .eq("user_type", "freelancer"),
    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_test", false)
      .eq("user_type", "team"),
    supabaseAdmin
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("is_test", false)
      .eq("status", "active")
      .eq("is_active", true)
      .not("activated_at", "is", null),
  ]);

  for (const r of [freelancers, teams, activePitCalls]) {
    if (r?.error) throw new Error(r.error.message);
  }

  return buildCapacitySnapshot({
    total_freelancers: freelancers.count ?? 0,
    total_teams: teams.count ?? 0,
    active_pit_calls: activePitCalls.count ?? 0,
  });
}
