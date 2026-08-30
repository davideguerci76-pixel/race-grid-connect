/**
 * Server-only reader for freelancer day_rate / currency.
 *
 * SELECT on those columns is revoked for `anon` and `authenticated`, so the
 * rate is never reachable through the Data API cross-user. Call this ONLY from
 * a server function that has already verified the caller is authorized to see
 * the rate according to the existing PITCALL business gating (Reveal, unlocked
 * Match Results, confirmed engagement, My Pool, Admin).
 */
export async function fetchRatesByIds(
  ids: string[],
): Promise<Map<string, { day_rate: number | null; currency: string | null }>> {
  const map = new Map<string, { day_rate: number | null; currency: string | null }>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return map;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("freelancer_profiles")
    .select("user_id, day_rate, currency")
    .in("user_id", unique);
  for (const r of (data ?? []) as any[]) {
    map.set(r.user_id, { day_rate: r.day_rate ?? null, currency: r.currency ?? null });
  }
  return map;
}
