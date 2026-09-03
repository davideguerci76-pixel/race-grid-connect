import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FREELANCER_PROFILE_COLUMNS } from "@/lib/profile-columns";

/** Freelancer: my unique pool code */
export const getMyPitCode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("freelancer_profiles")
      .select("pit_code")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { pit_code: (data as any)?.pit_code ?? null };
  });

/** Team: list of my pool members (names in clear) */
export const getMyPool = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("team_pool")
      .select("id, freelancer_id, source, created_at")
      .eq("team_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: any) => r.freelancer_id);
    if (!ids.length) return [] as any[];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles }, { data: fps }, { data: contacts }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, first_name, last_name, avatar_url").in("id", ids),
      supabaseAdmin
        .from("freelancer_profiles")
        .select("user_id, headline, role_group, sub_roles, location, day_rate, currency, pit_code")
        .in("user_id", ids),
      supabaseAdmin
        .from("freelancer_contacts")
        .select("user_id, phone_dial_code, phone_number")
        .in("user_id", ids),
    ]);
    const emailMap = new Map<string, string | null>();
    await Promise.all(
      ids.map(async (id: string) => {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(id);
        emailMap.set(id, userData?.user?.email ?? null);
      }),
    );

    const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const fMap = new Map((fps ?? []).map((f: any) => [f.user_id, f]));
    const contactMap = new Map((contacts ?? []).map((c: any) => [c.user_id, c]));
    return (rows ?? []).map((r: any) => {
      const p = pMap.get(r.freelancer_id);
      const f = fMap.get(r.freelancer_id);
      const legal = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
      const contact = contactMap.get(r.freelancer_id);
      return {
        id: r.id,
        freelancer_id: r.freelancer_id,
        source: r.source as "engagement" | "code",
        created_at: r.created_at as string,
        name: legal || p?.display_name || "—",
        avatar_url: p?.avatar_url ?? null,
        headline: f?.headline ?? null,
        role_group: f?.role_group ?? null,
        sub_roles: f?.sub_roles ?? [],
        location: f?.location ?? null,
        day_rate: f?.day_rate ?? null,
        currency: f?.currency ?? "EUR",
        pit_code: f?.pit_code ?? null,
        contact_email: emailMap.get(r.freelancer_id) ?? null,
        phone_dial_code: contact?.phone_dial_code ?? null,
        phone_number: contact?.phone_number ?? null,
      };
    });
  });

/** Freelancer: teams that keep me in their pool */
export const getPoolMemberships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("team_pool")
      .select("id, team_id, source, created_at")
      .eq("freelancer_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: any) => r.team_id);
    if (!ids.length) return [] as any[];
    const { data: teams } = await supabase.from("team_profiles").select("user_id, team_name, location").in("user_id", ids);
    const tMap = new Map((teams ?? []).map((t: any) => [t.user_id, t]));
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      team_id: r.team_id,
      source: r.source as "engagement" | "code",
      created_at: r.created_at as string,
      team_name: tMap.get(r.team_id)?.team_name ?? "—",
      location: tMap.get(r.team_id)?.location ?? null,
    }));
  });

/** Team: add a freelancer to my pool through their unique code */
export const addPoolMemberByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { code: string }) => z.object({ code: z.string().min(3).max(32) }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("add_pool_member_by_code" as any, { _code: data.code });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Team: manually add the confirmed freelancer of one of my engagements to my pool.
 * Owner-scoped SECURITY DEFINER RPC — never creates an engagement or a rating.
 */
export const addPoolMemberFromEngagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { engagement_id: string }) => z.object({ engagement_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("add_pool_member_from_engagement" as any, {
      _engagement_id: data.engagement_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Team: pool search cost + unlock state for one pit call */
export const getPoolSearchState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { request_id: string }) => z.object({ request_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: setting }, { data: unlock }] = await Promise.all([
      supabase.from("platform_settings").select("value_num").eq("key", "cost_pool_search").maybeSingle(),
      supabase
        .from("pool_search_unlocks")
        .select("id")
        .eq("team_id", userId)
        .eq("request_id", data.request_id)
        .maybeSingle(),
    ]);
    return { cost: Number((setting as any)?.value_num ?? 5), unlocked: !!unlock };
  });

export const unlockPoolSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { request_id: string }) => z.object({ request_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("unlock_pool_search" as any, { _request_id: data.request_id });
    if (error) throw new Error(error.message);
    const row = Array.isArray(res) ? (res as any[])[0] : (res as any);
    return { tokens_spent: Number(row?.tokens_spent ?? 0), balance: Number(row?.balance ?? 0) };
  });

/** Team: matches for one pit call restricted to my pool. Names always in clear. */
export const getPoolMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { request_id: string }) => z.object({ request_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: req, error: reqErr } = await supabase
      .from("requests")
      .select("*")
      .eq("id", data.request_id)
      .maybeSingle();
    if (reqErr) throw new Error(reqErr.message);
    if (!req) throw new Error("Pit call not found");
    if ((req as any).team_id !== userId) throw new Error("Not owner of this pit call");

    const [{ data: setting }, { data: unlock }, { data: poolRows }] = await Promise.all([
      supabase.from("platform_settings").select("value_num").eq("key", "cost_pool_search").maybeSingle(),
      supabase
        .from("pool_search_unlocks")
        .select("id")
        .eq("team_id", userId)
        .eq("request_id", data.request_id)
        .maybeSingle(),
      supabase.from("team_pool").select("freelancer_id, source").eq("team_id", userId),
    ]);
    const cost = Number((setting as any)?.value_num ?? 5);
    const unlocked = !!unlock;
    const poolIds = (poolRows ?? []).map((r: any) => r.freelancer_id);

    if (!poolIds.length) {
      return {
        request: req as any,
        cost,
        unlocked,
        pool_size: 0,
        items_full: [] as any[],
        items_partial: [] as any[],
      };
    }

    const { data: matches, error: mErr } = await supabase
      .from("matches")
      .select("*")
      .eq("stale", false)
      .eq("request_id", data.request_id)
      .in("freelancer_id", poolIds);
    if (mErr) throw new Error(mErr.message);

    const { data: requiredDaysData, error: requiredDaysError } = await (supabase.rpc as any)("request_required_days", {
      _request_id: data.request_id,
    });
    if (requiredDaysError) throw new Error(requiredDaysError.message);
    const requiredDays = ((requiredDaysData ?? []) as string[]).map((day) => String(day).slice(0, 10));

    const availabilityByFreelancer = new Map<string, Set<string>>();
    if (poolIds.length && requiredDays.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: availableDays } = await supabaseAdmin
        .from("availability")
        .select("freelancer_id, day")
        .in("freelancer_id", poolIds)
        .in("day", requiredDays);
      for (const row of (availableDays ?? []) as any[]) {
        const fid = row.freelancer_id as string;
        const current = availabilityByFreelancer.get(fid) ?? new Set<string>();
        current.add(String(row.day).slice(0, 10));
        availabilityByFreelancer.set(fid, current);
      }
    }

    const sortFn = (a: any, b: any) => {
      const ds = Number(b.final_score ?? b.match_score ?? 0) - Number(a.final_score ?? a.match_score ?? 0);
      if (ds !== 0) return ds;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    };
    const full = (matches ?? []).filter((m: any) => !m.is_partial).slice().sort(sortFn);
    const partial = (matches ?? []).filter((m: any) => m.is_partial).slice().sort(sortFn);
    const ids = [...full, ...partial].map((m: any) => m.freelancer_id);

    let pMap = new Map<string, any>();
    let fMap = new Map<string, any>();
    const ratingAvg = new Map<string, { avg: number; count: number }>();
    if (ids.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [{ data: profiles }, { data: fps }, { data: ratings }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, first_name, last_name").in("id", ids),
        supabaseAdmin.from("freelancer_profiles").select(FREELANCER_PROFILE_COLUMNS).in("user_id", ids),
        supabase.from("ratings").select("to_user_id, stars, overall, unlocked_at").in("to_user_id", ids).not("unlocked_at", "is", null),
      ]);
      pMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      fMap = new Map((fps ?? []).map((f: any) => [f.user_id, f]));
      // Pool search: caller owns the request; rate stays behind the `unlocked` gate below.
      {
        const { fetchRatesByIds } = await import("@/lib/rates.server");
        const rateMap = await fetchRatesByIds(ids);
        for (const [id, f] of fMap) Object.assign(f as any, rateMap.get(id as string) ?? {});
      }
      for (const r of (ratings ?? []) as any[]) {
        const cur = ratingAvg.get(r.to_user_id) ?? { avg: 0, count: 0 };
        const v = Number(r.overall ?? r.stars ?? 0);
        const c = cur.count + 1;
        ratingAvg.set(r.to_user_id, { avg: (cur.avg * cur.count + v) / c, count: c });
      }
    }

    const build = (m: any, i: number) => {
      const p = pMap.get(m.freelancer_id);
      const f = fMap.get(m.freelancer_id);
      const legal = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
      const availableSet = availabilityByFreelancer.get(m.freelancer_id) ?? new Set<string>();
      const missingDates = requiredDays.filter((day: string) => !availableSet.has(day));
      return {
        match_id: m.id,
        rank: i + 1,
        freelancer_id: m.freelancer_id,
        skills_score: Number(m.skills_score ?? m.match_score ?? 0),
        match_score: Number(m.skills_score ?? m.match_score ?? 0),
        is_perfect: !!m.is_perfect,
        is_partial: !!m.is_partial,
        edge_only: m.edge_only !== false,
        missing_days: Number(m.missing_days ?? 0),
        missing_dates: missingDates,
        overlap_days: m.overlap_days,
        rating: {
          average: ratingAvg.get(m.freelancer_id)?.avg ?? 0,
          count: ratingAvg.get(m.freelancer_id)?.count ?? 0,
        },
        // Pool members are known contacts: name always visible.
        name: unlocked ? legal || p?.display_name || "—" : null,
        profile: unlocked
          ? {
              headline: f?.headline ?? null,
              role_group: f?.role_group ?? null,
              sub_roles: f?.sub_roles ?? [],
              location: f?.location ?? null,
              day_rate: f?.day_rate ?? null,
              travels: f?.travels ?? false,
              skills: f?.skills ?? [],
            }
          : null,
      };
    };

    return {
      request: req as any,
      cost,
      unlocked,
      pool_size: poolIds.length,
      items_full: full.map(build),
      items_partial: partial.map(build),
    };
  });
