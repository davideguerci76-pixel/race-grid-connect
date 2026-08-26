import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

/** Full lifecycle view of every Pit Call: matches, first responder, blocked candidates, reopen history. */
export const adminListPitCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { currentAdminEnv } = await import("@/lib/admin-env.server");
    const envIsTest = await currentAdminEnv(supabaseAdmin, context.userId);
    const { data: requests, error } = await (supabaseAdmin
      .from("requests") as any)
      .select(
        "id, team_id, title, status, is_active, discipline, role_group, sub_role, duration, start_date, end_date, season_dates, location, circuit, created_at, updated_at",
      )
      .eq("is_test", envIsTest)
      .order("created_at", { ascending: false })
      .limit(400);
    if (error) throw new Error(error.message);

    const reqIds = (requests ?? []).map((r: any) => r.id);
    const teamIds = Array.from(new Set((requests ?? []).map((r: any) => r.team_id)));

    const [{ data: engs }, { data: matches }, { data: teamProfiles }] = await Promise.all([
      reqIds.length
        ? supabaseAdmin
            .from("engagements")
            .select(
              "id, request_id, freelancer_id, status, created_at, confirmed_at, cancelled_at, cancelled_by, cancellation_kind, cancellation_reason, start_date, end_date, freelancer_contacted, team_confirmed_contact",
            )
            .in("request_id", reqIds)
        : Promise.resolve({ data: [] as any[] }),
      reqIds.length
        ? supabaseAdmin
            .from("matches")
            .select("id, request_id, freelancer_id, final_score, match_score, is_partial, missing_days, created_at")
            .in("request_id", reqIds)
        : Promise.resolve({ data: [] as any[] }),
      teamIds.length
        ? supabaseAdmin.from("team_profiles").select("user_id, team_name, location").in("user_id", teamIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const freelancerIds = Array.from(
      new Set([
        ...((engs as any[]) ?? []).map((e) => e.freelancer_id),
        ...((matches as any[]) ?? []).map((m) => m.freelancer_id),
      ]),
    );
    const { data: profs } = freelancerIds.length
      ? await supabaseAdmin.from("profiles").select("id, display_name").in("id", freelancerIds)
      : { data: [] as any[] };

    const nameMap = new Map(((profs as any[]) ?? []).map((p) => [p.id, p.display_name]));
    const teamMap = new Map(((teamProfiles as any[]) ?? []).map((t) => [t.user_id, t]));

    const engsByReq = new Map<string, any[]>();
    for (const e of ((engs as any[]) ?? [])) {
      const arr = engsByReq.get(e.request_id) ?? [];
      arr.push({ ...e, freelancer_name: nameMap.get(e.freelancer_id) ?? "Freelancer" });
      engsByReq.set(e.request_id, arr);
    }
    const matchesByReq = new Map<string, any[]>();
    for (const m of ((matches as any[]) ?? [])) {
      const arr = matchesByReq.get(m.request_id) ?? [];
      arr.push({ ...m, freelancer_name: nameMap.get(m.freelancer_id) ?? "Freelancer" });
      matchesByReq.set(m.request_id, arr);
    }

    const rows = (requests ?? []).map((r: any) => {
      const el = (engsByReq.get(r.id) ?? []).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const confirmed = el.find((e) => e.status === "confirmed" || e.status === "completed") ?? null;
      const cancelled = el.filter((e) => e.status === "cancelled");
      const withdrawn = cancelled.filter((e) => !!e.confirmed_at);
      // Candidates who were proposed but never got to confirm because the slot closed first
      const blocked = el.filter(
        (e) => !e.confirmed_at && (e.status === "cancelled" || (e.status === "proposed" && !!confirmed)),
      );
      const ml = (matchesByReq.get(r.id) ?? []).sort((a, b) => Number(b.final_score) - Number(a.final_score));
      const reopened = withdrawn.length > 0 && !confirmed && (r.status === "active" || r.is_active);

      return {
        ...r,
        team_name: teamMap.get(r.team_id)?.team_name ?? "Team",
        team_location: teamMap.get(r.team_id)?.location ?? null,
        matches_count: ml.length,
        candidates: ml.slice(0, 20),
        engagements: el,
        first_responder: confirmed
          ? {
              freelancer_id: confirmed.freelancer_id,
              name: confirmed.freelancer_name,
              confirmed_at: confirmed.confirmed_at,
              engagement_id: confirmed.id,
            }
          : null,
        blocked_candidates: blocked.map((e) => ({
          freelancer_id: e.freelancer_id,
          name: e.freelancer_name,
          proposed_at: e.created_at,
          outcome: e.status === "cancelled" ? "slot_closed" : "pending_but_locked",
        })),
        withdrawals: withdrawn.map((e) => ({
          engagement_id: e.id,
          name: e.freelancer_name,
          kind: e.cancellation_kind,
          by_team: e.cancelled_by === r.team_id,
          at: e.cancelled_at,
          reason: e.cancellation_reason,
        })),
        slots_locked: !!confirmed,
        reopened,
        hot: !confirmed && ml.length >= 5 && (r.status === "active" || r.is_active),
      };
    });

    const stats = {
      total: rows.length,
      active: rows.filter((r: any) => r.status === "active").length,
      paused: rows.filter((r: any) => r.status === "paused").length,
      filled: rows.filter((r: any) => r.status === "filled").length,
      closed: rows.filter((r: any) => r.status === "closed" || r.status === "completed").length,
      hot: rows.filter((r: any) => r.hot).length,
      reopened: rows.filter((r: any) => r.reopened).length,
      locked: rows.filter((r: any) => r.slots_locked).length,
    };

    return { rows, stats };
  });

export const adminSetPitCallStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        request_id: z.string().uuid(),
        status: z.enum(["active", "paused", "closed", "completed"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const isActive = data.status === "active";
    const { error } = await supabaseAdmin
      .from("requests")
      .update({ status: data.status, is_active: isActive, updated_at: new Date().toISOString() } as never)
      .eq("id", data.request_id);
    if (error) throw new Error(error.message);
    if (isActive) {
      await supabaseAdmin.rpc("recompute_matches", { _freelancer_id: null, _request_id: data.request_id } as never);
    }
    return { ok: true, status: data.status };
  });

export const adminDeletePitCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ request_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: engs } = await supabaseAdmin
      .from("engagements")
      .select("id, status")
      .eq("request_id", data.request_id);
    if (((engs as any[]) ?? []).some((e) => e.status === "confirmed")) {
      throw new Error("Cannot delete: a confirmed engagement exists. Close it first.");
    }
    await supabaseAdmin.from("matches").delete().eq("request_id", data.request_id);
    await supabaseAdmin.from("engagements").delete().eq("request_id", data.request_id);
    const { error } = await supabaseAdmin.from("requests").delete().eq("id", data.request_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Global availability heatmap: number of freelancers available per calendar day, with profile filters. */
export const adminAvailabilityCalendar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        from: z.string(),
        to: z.string(),
        role_group: z.string().optional().nullable(),
        sub_role: z.string().optional().nullable(),
        level: z.enum(["junior", "intermediate", "senior"]).optional().nullable(),
        discipline: z.string().optional().nullable(),
        skills: z.array(z.string()).optional().default([]),
        education: z.string().optional().nullable(),
        language: z.string().optional().nullable(),
        travels: z.boolean().optional().nullable(),
        max_day_rate: z.number().optional().nullable(),
        country: z.string().optional().nullable(),
        search: z.string().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("freelancer_profiles")
      .select(
        "user_id, role_group, sub_roles, disciplines, skills, education, languages, travels, day_rate, location, location_country",
      );
    if (data.role_group) q = q.eq("role_group", data.role_group);
    if (data.discipline) q = q.contains("disciplines", [data.discipline] as any);
    if (data.skills && data.skills.length) q = q.contains("skills", data.skills as any);
    if (data.education) q = q.eq("education", data.education);
    if (typeof data.travels === "boolean") q = q.eq("travels", data.travels);
    if (typeof data.max_day_rate === "number") q = q.lte("day_rate", data.max_day_rate);
    if (data.country) q = q.ilike("location_country", `%${data.country}%`);

    const { data: fps, error } = await q;
    if (error) throw new Error(error.message);

    const levelRank: Record<string, number> = { junior: 1, intermediate: 2, senior: 3 };
    let list = ((fps as any[]) ?? []).filter((f) => {
      if (data.sub_role) {
        const arr = Array.isArray(f.sub_roles) ? f.sub_roles : [];
        const hit = arr.find((s: any) => s?.sub_role === data.sub_role);
        if (!hit) return false;
        if (data.level && (levelRank[String(hit.level ?? "junior")] ?? 1) < (levelRank[data.level] ?? 1)) return false;
      }
      if (data.language) {
        const langs = Array.isArray(f.languages) ? f.languages : [];
        if (!langs.some((l: any) => String(l?.code ?? "").toLowerCase() === data.language!.toLowerCase())) return false;
      }
      return true;
    });

    const ids = list.map((f) => f.user_id);
    if (!ids.length) return { days: [], total_freelancers: 0 };

    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .in("id", ids)
      .is("blocked_at", null);
    let allowed = new Set(((profs as any[]) ?? []).map((p) => p.id));
    const nameMap = new Map(((profs as any[]) ?? []).map((p) => [p.id, p.display_name]));
    if (data.search) {
      const s = data.search.toLowerCase();
      allowed = new Set([...allowed].filter((id) => String(nameMap.get(id) ?? "").toLowerCase().includes(s)));
    }

    const { data: avail, error: aErr } = await supabaseAdmin
      .from("availability")
      .select("freelancer_id, day")
      .in("freelancer_id", [...allowed])
      .gte("day", data.from)
      .lte("day", data.to);
    if (aErr) throw new Error(aErr.message);

    const byDay = new Map<string, string[]>();
    for (const a of ((avail as any[]) ?? [])) {
      if (!allowed.has(a.freelancer_id)) continue;
      const arr = byDay.get(a.day) ?? [];
      arr.push(String(nameMap.get(a.freelancer_id) ?? "Freelancer"));
      byDay.set(a.day, arr);
    }

    return {
      total_freelancers: allowed.size,
      days: [...byDay.entries()]
        .map(([day, names]) => ({ day, count: names.length, names: names.slice(0, 12) }))
        .sort((a, b) => a.day.localeCompare(b.day)),
    };
  });
