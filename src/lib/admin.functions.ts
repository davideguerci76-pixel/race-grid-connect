import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, logAdminAction, freelancerPatch, teamPatch } from "@/lib/admin-helpers";

export const checkAmIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) return { isAdmin: false };
    return { isAdmin: !!data };
  });

export const adminListFreelancers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { currentAdminEnv } = await import("@/lib/admin-env.server");
    const envIsTest = await currentAdminEnv(supabaseAdmin, context.userId);
    const { data: profiles, error } = await (supabaseAdmin
      .from("profiles") as any)
      .select("id, display_name, user_type, token_balance, blocked_at, created_at, preferred_language")
      .eq("is_test", envIsTest)
      .eq("user_type", "freelancer")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (profiles ?? []).map((p: any) => p.id);
    const [{ data: fps }, { data: roles }, { data: contacts }] = await Promise.all([
      supabaseAdmin.from("freelancer_profiles").select("*").in("user_id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("freelancer_contacts").select("user_id, phone_dial_code, phone_number").in("user_id", ids),
    ]);
    const emails: Record<string, string> = {};
    for (const id of ids) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
      if (u?.user?.email) emails[id] = u.user.email;
    }
    const contactMap = new Map((contacts ?? []).map((c: any) => [c.user_id, c]));
    const fpMap = new Map(
      (fps ?? []).map((r: any) => [r.user_id, { ...r, phone_dial_code: contactMap.get(r.user_id)?.phone_dial_code ?? null, phone_number: contactMap.get(r.user_id)?.phone_number ?? null }]),
    );
    const roleMap = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = roleMap.get((r as any).user_id) ?? [];
      arr.push((r as any).role);
      roleMap.set((r as any).user_id, arr);
    }
    const { data: allRatings } = await supabaseAdmin
      .from("ratings")
      .select("to_user_id, stars, overall, unlocked_at, moderation_status")
      .in("to_user_id", ids)
      .in("moderation_status", ["active", "approved"] as any)
      .not("unlocked_at", "is", null);
    const ratingMap = new Map<string, { avg: number; count: number }>();
    for (const r of (allRatings ?? []) as any[]) {
      const cur = ratingMap.get(r.to_user_id) ?? { avg: 0, count: 0 };
      const v = Number(r.overall ?? r.stars ?? 0);
      const c = cur.count + 1;
      ratingMap.set(r.to_user_id, { avg: (cur.avg * cur.count + v) / c, count: c });
    }
    return (profiles ?? []).map((p: any) => ({
      ...p,
      email: emails[p.id] ?? null,
      roles: roleMap.get(p.id) ?? [],
      freelancer: fpMap.get(p.id) ?? null,
      rating_avg: ratingMap.get(p.id)?.avg ?? 0,
      rating_count: ratingMap.get(p.id)?.count ?? 0,
    }));
  });

export const adminListTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { currentAdminEnv } = await import("@/lib/admin-env.server");
    const envIsTest = await currentAdminEnv(supabaseAdmin, context.userId);
    const { data: profiles, error } = await (supabaseAdmin
      .from("profiles") as any)
      .select("id, display_name, user_type, token_balance, blocked_at, created_at, preferred_language")
      .eq("is_test", envIsTest)
      .eq("user_type", "team")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (profiles ?? []).map((p: any) => p.id);
    const [{ data: tps }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("team_profiles").select("*").in("user_id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);
    const emails: Record<string, string> = {};
    for (const id of ids) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
      if (u?.user?.email) emails[id] = u.user.email;
    }
    const tpMap = new Map((tps ?? []).map((r: any) => [r.user_id, r]));
    const roleMap = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = roleMap.get((r as any).user_id) ?? [];
      arr.push((r as any).role);
      roleMap.set((r as any).user_id, arr);
    }
    const { data: teamRatings } = await supabaseAdmin
      .from("ratings")
      .select("to_user_id, stars, overall, unlocked_at, moderation_status")
      .in("to_user_id", ids)
      .in("moderation_status", ["active", "approved"] as any)
      .not("unlocked_at", "is", null);
    const ratingMap = new Map<string, { avg: number; count: number }>();
    for (const r of (teamRatings ?? []) as any[]) {
      const cur = ratingMap.get(r.to_user_id) ?? { avg: 0, count: 0 };
      const v = Number(r.overall ?? r.stars ?? 0);
      const c = cur.count + 1;
      ratingMap.set(r.to_user_id, { avg: (cur.avg * cur.count + v) / c, count: c });
    }
    return (profiles ?? []).map((p: any) => ({
      ...p,
      email: emails[p.id] ?? null,
      roles: roleMap.get(p.id) ?? [],
      team: tpMap.get(p.id) ?? null,
      rating_avg: ratingMap.get(p.id)?.avg ?? 0,
      rating_count: ratingMap.get(p.id)?.count ?? 0,
    }));
  });

export const adminSetTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ user_id: z.string().uuid(), balance: z.number().int().min(0).max(1_000_000) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("token_balance").eq("id", data.user_id).single();
    const current = prof?.token_balance ?? 0;
    const delta = data.balance - current;
    if (delta !== 0) {
      await supabaseAdmin.from("token_transactions").insert({
        user_id: data.user_id,
        delta,
        reason: delta > 0 ? "admin_credit" : "admin_debit",
        note: `Admin adjustment by ${context.userId}`,
      } as never);
    }
    const { error } = await supabaseAdmin.from("profiles").update({ token_balance: data.balance } as never).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true, balance: data.balance };
  });

export const adminSetBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ user_id: z.string().uuid(), blocked: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ blocked_at: data.blocked ? new Date().toISOString() : null } as never)
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    if (data.blocked) {
      await supabaseAdmin.auth.admin.updateUserById(data.user_id, { ban_duration: "876000h" });
    } else {
      await supabaseAdmin.auth.admin.updateUserById(data.user_id, { ban_duration: "none" });
    }
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.user_id === context.userId) throw new Error("You cannot delete your own account here.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ user_id: z.string().uuid(), is_admin: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.user_id === context.userId && !data.is_admin) throw new Error("You cannot revoke your own admin role.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.is_admin) {
      await supabaseAdmin.from("user_roles").upsert({ user_id: data.user_id, role: "admin" } as never, { onConflict: "user_id,role" });
    } else {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", "admin");
    }
    return { ok: true };
  });

export const adminGetMatchingWeights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("matching_weights").select("*").eq("id", true).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const adminUpdateMatchingWeights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({
      sub_role_weight: z.number().min(0).max(100),
      skills_weight: z.number().min(0).max(100),
      disciplines_weight: z.number().min(0).max(100),
      day_rate_weight: z.number().min(0).max(100),
      languages_weight: z.number().min(0).max(100),
      education_weight: z.number().min(0).max(100),
      location_weight: z.number().min(0).max(100),
      calendar_freshness_weight: z.number().min(0).max(100).optional().default(0),
      level_one_below_pct: z.number().min(0).max(100),
      level_two_below_pct: z.number().min(0).max(100),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    // calendar_freshness_weight is no longer part of the professional score:
    // calendar freshness is now an availability-eligibility requirement only.
    const total = data.sub_role_weight + data.skills_weight + data.disciplines_weight + data.day_rate_weight + data.languages_weight + data.education_weight + data.location_weight;
    if (Math.abs(total - 100) > 0.01) throw new Error(`Weights must sum to 100 (currently ${total.toFixed(2)})`);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("matching_weights")
      .update({ ...data, role_weight: 0, updated_at: new Date().toISOString() } as never)
      .eq("id", true);
    if (error) throw new Error(error.message);
    // Recompute all matches with new weights
    await supabaseAdmin.rpc("recompute_matches_env", { _is_test: false } as never);
    return { ok: true };
  });

// ---- Platform / token settings ----
export const adminListSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("platform_settings")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpdateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({
      updates: z.array(z.object({ key: z.string().min(1), value_num: z.number().min(0) })).min(1),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    for (const u of data.updates) {
      const { error } = await supabaseAdmin
        .from("platform_settings")
        .update({ value_num: u.value_num, updated_at: nowIso, updated_by: context.userId } as never)
        .eq("key", u.key);
      if (error) throw new Error(`${u.key}: ${error.message}`);
    }
    return { ok: true, count: data.updates.length };
  });

// ---- V2.3 Platform Rules (configuration knobs only, no consumers yet) ----
export const PLATFORM_RULE_BOUNDS: Record<string, { min: number; max: number }> = {
  strong_match_threshold: { min: 1, max: 50 },
  max_modify_per_pitcall: { min: 0, max: 20 },
  daily_recheck_budget: { min: 1, max: 100 },
  red_cancel_budget_cost: { min: 0, max: 20 },
  post_review_window_minutes: { min: 0, max: 120 },
  team_match_update_notification_hours: { min: 1, max: 72 },
  availability_recompute_delay_minutes: { min: 0, max: 60 },
};

export const PLATFORM_RULE_KEYS = Object.keys(PLATFORM_RULE_BOUNDS);

export const adminUpdatePlatformRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        updates: z
          .array(
            z.object({
              key: z.string().refine((k) => k in PLATFORM_RULE_BOUNDS, { message: "unknown_setting_key" }),
              value_num: z.number(),
            }),
          )
          .min(1),
      })
      .superRefine((val, ctx) => {
        for (const u of val.updates) {
          const b = PLATFORM_RULE_BOUNDS[u.key];
          if (!b) continue;
          if (!Number.isInteger(u.value_num)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${u.key}: must be an integer` });
            continue;
          }
          if (u.value_num < b.min || u.value_num > b.max) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `${u.key}: must be between ${b.min} and ${b.max}`,
            });
          }
        }
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    for (const u of data.updates) {
      const { data: rows, error } = await supabaseAdmin
        .from("platform_settings")
        .update({ value_num: u.value_num, updated_at: nowIso, updated_by: context.userId } as never)
        .eq("key", u.key)
        .select("key");
      if (error) throw new Error(`${u.key}: ${error.message}`);
      if (!rows || rows.length === 0) throw new Error(`${u.key}: setting not found`);
    }
    return { ok: true, count: data.updates.length };
  });



// Public reader (auth): any signed-in user can look up current values (e.g. UI hints)
export const getPlatformSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("platform_settings")
      .select("key, value_num, category, label, unit");
    if (error) throw new Error(error.message);
    return data ?? [];
  });



// ==================== RATING MODERATION ====================

export const adminListRatings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ filter: z.enum(["all", "flagged", "frozen", "auto_suspicious"]).default("all") })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("ratings")
      .select(
        "id, engagement_id, from_user_id, to_user_id, stars, overall, comment, sub_scores, created_at, unlocked_at, moderation_status, flag_reason, flagged_by, flagged_at, moderated_by, moderated_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (data.filter === "flagged") q = q.eq("moderation_status", "flagged");
    else if (data.filter === "frozen") q = q.eq("moderation_status", "frozen");

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const userIds = Array.from(
      new Set(((rows ?? []) as any[]).flatMap((r) => [r.from_user_id, r.to_user_id])),
    );
    const engIds = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.engagement_id).filter(Boolean)));

    const [{ data: profs }, { data: engs }] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from("profiles").select("id, display_name, user_type").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      engIds.length
        ? supabaseAdmin
            .from("engagements")
            .select("id, request_id, request:requests(title)")
            .in("id", engIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const profMap = new Map(((profs as any[]) ?? []).map((p) => [p.id, p]));
    const engMap = new Map(((engs as any[]) ?? []).map((e) => [e.id, e]));

    // Compute auto-suspicious: rating overall <= 2 AND recipient's average across other visible ratings >= 4
    const recipients = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.to_user_id)));
    const avgMap = new Map<string, { sum: number; count: number }>();
    if (recipients.length) {
      const { data: agg } = await supabaseAdmin
        .from("ratings")
        .select("to_user_id, stars, overall, moderation_status")
        .in("to_user_id", recipients)
        .in("moderation_status", ["active", "approved"] as any);
      for (const r of ((agg as any[]) ?? [])) {
        const v = Number(r.overall ?? r.stars ?? 0);
        const cur = avgMap.get(r.to_user_id) ?? { sum: 0, count: 0 };
        cur.sum += v;
        cur.count += 1;
        avgMap.set(r.to_user_id, cur);
      }
    }

    const enriched = ((rows ?? []) as any[]).map((r) => {
      const other = avgMap.get(r.to_user_id) ?? { sum: 0, count: 0 };
      const otherSum = other.sum - Number(r.overall ?? r.stars ?? 0);
      const otherCount = Math.max(0, other.count - (r.moderation_status === "active" || r.moderation_status === "approved" ? 1 : 0));
      const otherAvg = otherCount > 0 ? otherSum / otherCount : null;
      const value = Number(r.overall ?? r.stars ?? 0);
      const autoSus = value <= 2 && otherAvg !== null && otherAvg >= 4 && otherCount >= 2;
      return {
        ...r,
        auto_suspicious: autoSus,
        from_profile: profMap.get(r.from_user_id) ?? null,
        to_profile: profMap.get(r.to_user_id) ?? null,
        engagement: engMap.get(r.engagement_id) ?? null,
      };
    });

    if (data.filter === "auto_suspicious") return enriched.filter((r) => r.auto_suspicious);
    return enriched;
  });

export const adminModerateRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ rating_id: z.string().uuid(), action: z.enum(["freeze", "delete", "approve"]) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_set_rating_moderation" as any, {
      _rating_id: data.rating_id,
      _action: data.action,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminMarketPrivateStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("freelancer_profiles")
      .select("day_rate, currency")
      .not("day_rate", "is", null);
    if (error) throw new Error(error.message);
    const rates = ((data ?? []) as any[]).map((r) => Number(r.day_rate)).filter((n) => n > 0);
    const avg = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
    const sorted = [...rates].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] ?? null : null;
    return {
      avg_day_rate: avg,
      median_day_rate: median,
      min_day_rate: sorted.length ? sorted[0]! : null,
      max_day_rate: sorted.length ? sorted[sorted.length - 1]! : null,
      sample: rates.length,
    };
  });


export const adminUpdateFreelancer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => freelancerPatch.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { user_id, display_name, first_name, last_name, token_balance, phone_dial_code, phone_number, ...fp } = data;

    const profilePatch: Record<string, unknown> = {};
    if (display_name !== undefined) profilePatch["display_name"] = display_name;
    if (first_name !== undefined) profilePatch["first_name"] = first_name;
    if (last_name !== undefined) profilePatch["last_name"] = last_name;
    if (token_balance !== undefined) {
      const { data: prof } = await supabaseAdmin.from("profiles").select("token_balance").eq("id", user_id).single();
      const delta = token_balance - (prof?.token_balance ?? 0);
      if (delta !== 0) {
        await supabaseAdmin.from("token_transactions").insert({
          user_id,
          delta,
          reason: delta > 0 ? "admin_credit" : "admin_debit",
          note: `Admin inline edit by ${context.userId}`,
        } as never);
      }
      profilePatch["token_balance"] = token_balance;
    }
    if (Object.keys(profilePatch).length) {
      const { error } = await supabaseAdmin.from("profiles").update(profilePatch as never).eq("id", user_id);
      if (error) throw new Error(error.message);
    }

    const fpPatch = Object.fromEntries(Object.entries(fp).filter(([, v]) => v !== undefined));
    if (Object.keys(fpPatch).length) {
      const { error } = await supabaseAdmin
        .from("freelancer_profiles")
        .upsert({ user_id, ...fpPatch } as never, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
    }

    if (phone_dial_code !== undefined || phone_number !== undefined) {
      const patch: Record<string, unknown> = { user_id };
      if (phone_dial_code !== undefined) patch["phone_dial_code"] = phone_dial_code;
      if (phone_number !== undefined) patch["phone_number"] = phone_number;
      const { error } = await supabaseAdmin
        .from("freelancer_contacts")
        .upsert(patch as never, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });


export const adminUpdateTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => teamPatch.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { user_id, display_name, token_balance, ...tp } = data;

    const profilePatch: Record<string, unknown> = {};
    if (display_name !== undefined) profilePatch["display_name"] = display_name;
    if (token_balance !== undefined) {
      const { data: prof } = await supabaseAdmin.from("profiles").select("token_balance").eq("id", user_id).single();
      const delta = token_balance - (prof?.token_balance ?? 0);
      if (delta !== 0) {
        await supabaseAdmin.from("token_transactions").insert({
          user_id,
          delta,
          reason: delta > 0 ? "admin_credit" : "admin_debit",
          note: `Admin inline edit by ${context.userId}`,
        } as never);
      }
      profilePatch["token_balance"] = token_balance;
    }
    if (Object.keys(profilePatch).length) {
      const { error } = await supabaseAdmin.from("profiles").update(profilePatch as never).eq("id", user_id);
      if (error) throw new Error(error.message);
    }

    const tpPatch = Object.fromEntries(Object.entries(tp).filter(([, v]) => v !== undefined));
    if (Object.keys(tpPatch).length) {
      const { data: existing } = await supabaseAdmin.from("team_profiles").select("team_name").eq("user_id", user_id).maybeSingle();
      const payload: Record<string, unknown> = { user_id, ...tpPatch };
      if (!existing && payload["team_name"] === undefined) payload["team_name"] = display_name ?? "Team";
      const { error } = await supabaseAdmin
        .from("team_profiles")
        .upsert(payload as never, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminGetTeamPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ team_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pool, error } = await supabaseAdmin
      .from("team_pool")
      .select("freelancer_id, source, created_at")
      .eq("team_id", data.team_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = ((pool ?? []) as any[]).map((p) => p.freelancer_id);
    if (ids.length === 0) return [];
    const [{ data: profiles }, { data: fps }, { data: contacts }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, first_name, last_name").in("id", ids),
      supabaseAdmin.from("freelancer_profiles").select("user_id, pit_code, location, role_group").in("user_id", ids),
      supabaseAdmin.from("freelancer_contacts").select("user_id, phone_dial_code, phone_number").in("user_id", ids),
    ]);
    const pMap = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]));
    const fMap = new Map(((fps ?? []) as any[]).map((p) => [p.user_id, p]));
    const cMap = new Map(((contacts ?? []) as any[]).map((p) => [p.user_id, p]));
    const out: any[] = [];
    for (const row of (pool ?? []) as any[]) {
      const id = row.freelancer_id;
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
      const c = cMap.get(id);
      out.push({
        id,
        first_name: pMap.get(id)?.first_name ?? null,
        last_name: pMap.get(id)?.last_name ?? null,
        display_name: pMap.get(id)?.display_name ?? "—",
        email: u?.user?.email ?? null,
        phone: c?.phone_number ? `${c.phone_dial_code ?? ""} ${c.phone_number}`.trim() : null,
        pit_code: fMap.get(id)?.pit_code ?? null,
        role_group: fMap.get(id)?.role_group ?? null,
        location: fMap.get(id)?.location ?? null,
        source: row.source,
        created_at: row.created_at,
      });
    }
    return out;
  });

// ============ USER MANAGEMENT SUITE ============

/** Full profile card (anagraphic + professional data) for a single user. */
export const adminGetUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", data.user_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("User not found");
    const isFreelancer = (profile as any).user_type === "freelancer";
    const [{ data: fp }, { data: tp }, { data: contact }, { data: roles }] = await Promise.all([
      isFreelancer
        ? supabaseAdmin.from("freelancer_profiles").select("*").eq("user_id", data.user_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      !isFreelancer
        ? supabaseAdmin.from("team_profiles").select("*").eq("user_id", data.user_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      supabaseAdmin.from("freelancer_contacts").select("*").eq("user_id", data.user_id).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user_id),
    ]);
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    return {
      profile,
      freelancer: fp ?? null,
      team: tp ?? null,
      contact: contact ?? null,
      roles: ((roles ?? []) as any[]).map((r) => r.role),
      auth: authUser?.user
        ? {
            email: authUser.user.email ?? null,
            email_confirmed_at: authUser.user.email_confirmed_at ?? null,
            last_sign_in_at: authUser.user.last_sign_in_at ?? null,
            created_at: authUser.user.created_at ?? null,
            providers: (authUser.user.app_metadata as any)?.providers ?? [],
            banned_until: (authUser.user as any)?.banned_until ?? null,
          }
        : null,
    };
  });

/** Availability days + engagements (freelancer) or request date ranges (team). */
export const adminGetUserCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_type, display_name")
      .eq("id", data.user_id)
      .maybeSingle();
    const userType = (profile as any)?.user_type ?? "freelancer";
    const isFreelancer = userType === "freelancer";

    const { data: availability } = isFreelancer
      ? await supabaseAdmin.from("availability").select("day").eq("freelancer_id", data.user_id).order("day")
      : ({ data: [] } as any);

    const { data: engagements } = await supabaseAdmin
      .from("engagements")
      .select("id, start_date, end_date, status, freelancer_id, team_id")
      .or(`freelancer_id.eq.${data.user_id},team_id.eq.${data.user_id}`)
      .order("start_date");

    const { data: requests } = !isFreelancer
      ? await supabaseAdmin
          .from("requests")
          .select("id, title, start_date, end_date, season_dates, status")
          .eq("team_id", data.user_id)
          .order("start_date")
      : ({ data: [] } as any);

    let freshness: string | null = null;
    if (isFreelancer) {
      const { data: fp } = await supabaseAdmin
        .from("freelancer_profiles")
        .select("calendar_last_updated_at")
        .eq("user_id", data.user_id)
        .maybeSingle();
      freshness = (fp as any)?.calendar_last_updated_at ?? null;
    }

    return {
      user_type: userType,
      display_name: (profile as any)?.display_name ?? "—",
      days: ((availability ?? []) as any[]).map((a) => a.day as string),
      engagements: (engagements ?? []) as any[],
      requests: (requests ?? []) as any[],
      calendar_last_updated_at: freshness,
    };
  });

/** Trigger the password recovery email (sent through the configured sender domain). */
export const adminSendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ user_id: z.string().uuid(), redirect_to: z.string().url() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    const email = u?.user?.email;
    if (!email) throw new Error("This user has no email address on file.");
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo: data.redirect_to });
    if (error) throw new Error(error.message);
    await logAdminAction(context.userId, data.user_id, "password_reset_sent", { email });
    return { ok: true, email };
  });

/** Revoke every active session of the user (immediate forced logout). */
export const adminForceLogout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const url = process.env["SUPABASE_URL"]!;
    const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
    const res = await fetch(`${url}/auth/v1/admin/users/${data.user_id}/logout`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scope: "global" }),
    });
    if (!res.ok && res.status !== 204) {
      const body = await res.text();
      throw new Error(`Force logout failed (${res.status}): ${body.slice(0, 200)}`);
    }
    await logAdminAction(context.userId, data.user_id, "force_logout", {});
    return { ok: true };
  });

/** Generate a one-time sign-in link so the admin can operate as the user (audited). */
export const adminImpersonateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ user_id: z.string().uuid(), redirect_to: z.string().url() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.user_id === context.userId) throw new Error("You are already signed in as this account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    const email = u?.user?.email;
    if (!email) throw new Error("This user has no email address on file.");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: data.redirect_to },
    });
    if (error) throw new Error(error.message);
    const actionLink = (link as any)?.properties?.action_link;
    if (!actionLink) throw new Error("Could not generate the impersonation link.");
    await logAdminAction(context.userId, data.user_id, "impersonate", { email });
    return { ok: true, url: actionLink as string, email };
  });

/** Recent admin actions, optionally scoped to one user. */
export const adminListAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ user_id: z.string().uuid().optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("admin_audit_log")
      .select("id, admin_id, target_user_id, action, details, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.user_id) q = q.eq("target_user_id", data.user_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });
