import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Enums are validated server-side by Postgres; keep TS-side loose to allow the extended taxonomy.
const disciplineEnum = z.string().min(1).max(64);
const roleEnum = z.string().min(1).max(64);
const durationEnum = z.enum(["full_season", "race_weekend", "test_session"]);

// ---- Availability ----
export const setAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { dates: string[]; add: boolean }) =>
    z.object({ dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(400), add: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.add) {
      const rows = data.dates.map((d) => ({ freelancer_id: userId, day: d }));
      const { error } = await supabase.from("availability").upsert(rows, { onConflict: "freelancer_id,day" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("availability").delete().eq("freelancer_id", userId).in("day", data.dates);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const getMyAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("availability").select("day").eq("freelancer_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.day);
  });

// ---- Profile saving ----
export const updateMyDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ display_name: z.string().trim().min(2).max(80) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("profiles")
      .update({ display_name: data.display_name })
      .eq("id", context.userId)
      .select("id, display_name, avatar_url, user_type, preferred_language, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateMyFreelancerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        role: roleEnum,
        headline: z.string().max(140).optional().nullable(),
        disciplines: z.array(disciplineEnum).max(80),
        skills: z.array(z.string().max(64)).max(80).optional(),
        day_rate: z.number().int().min(0).optional().nullable(),
        location: z.string().max(140).optional().nullable(),
        bio: z.string().max(1200).optional().nullable(),
        travels: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("user_type")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (profile?.user_type !== "freelancer") throw new Error("This account is not a freelancer profile");

    const { data: row, error } = await context.supabase.from("freelancer_profiles").upsert(
      {
        user_id: context.userId,
        role: data.role,
        headline: data.headline || null,
        disciplines: data.disciplines,
        skills: data.skills ?? [],
        day_rate: data.day_rate ?? null,
        location: data.location || null,
        bio: data.bio || null,
        travels: data.travels,
      } as never,
      { onConflict: "user_id" },
    ).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateMyTeamProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        team_name: z.string().trim().min(2).max(120),
        team_type: z.string().max(120).optional().nullable(),
        location: z.string().max(140).optional().nullable(),
        primary_discipline: disciplineEnum.optional().nullable(),
        bio: z.string().max(1200).optional().nullable(),
        website: z.string().max(200).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("user_type")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (profile?.user_type !== "team") throw new Error("This account is not a team profile");

    const initials = data.team_name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("");

    const { data: row, error } = await context.supabase.from("team_profiles").upsert(
      {
        user_id: context.userId,
        team_name: data.team_name,
        initials,
        team_type: data.team_type || null,
        location: data.location || null,
        primary_discipline: data.primary_discipline || null,
        bio: data.bio || null,
        website: data.website || null,
      } as never,
      { onConflict: "user_id" },
    ).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---- Requests ----
export const createRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        title: z.string().min(3).max(120),
        role: roleEnum,
        discipline: disciplineEnum,
        circuit: z.string().max(120).optional().nullable(),
        location: z.string().max(120).optional().nullable(),
        start_date: z.string(),
        end_date: z.string(),
        budget_min: z.number().int().min(0).optional().nullable(),
        budget_max: z.number().int().min(0).optional().nullable(),
        budget_unit: z.enum(["day", "event", "season"]).default("day"),
        duration: durationEnum,
        notes: z.string().max(1000).optional().nullable(),
        season_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(400).optional(),
        skills: z.array(z.string().max(64)).max(50).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const payload: Record<string, unknown> = {
      title: data.title,
      role: data.role,
      discipline: data.discipline,
      duration: data.duration,
      circuit: data.circuit ?? null,
      location: data.location ?? null,
      start_date: data.start_date,
      end_date: data.end_date,
      budget_min: data.budget_min ?? null,
      budget_max: data.budget_max ?? null,
      budget_unit: data.budget_unit,
      notes: data.notes ?? null,
      season_dates: data.season_dates ?? null,
      skills: data.skills ?? [],
    };
    const { data: row, error } = await context.supabase.rpc("create_request", { _payload: payload as never });
    if (error) throw new Error(error.message);
    return row;
  });

export const setRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; status: "active" | "paused" | "closed" | "completed" }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "paused", "closed", "completed"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("set_request_status", { _id: data.id, _status: data.status });
    if (error) throw new Error(error.message);
    return row;
  });

export const getMyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("requests")
      .select("*")
      .eq("team_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r) => r.id);
    let counts: Record<string, number> = {};
    if (ids.length) {
      const { data: matches } = await supabase.from("matches").select("request_id").in("request_id", ids);
      counts = (matches ?? []).reduce<Record<string, number>>((acc, m) => {
        const rid = (m as { request_id: string }).request_id;
        acc[rid] = (acc[rid] ?? 0) + 1;
        return acc;
      }, {});
    }
    return (data ?? []).map((r) => ({ ...r, matches_count: counts[r.id] ?? 0 }));
  });

export const deactivateRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("requests").update({ is_active: false }).eq("id", data.id).eq("team_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ---- Matches ----
export const getMyMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", userId).maybeSingle();
    if (!profile) return { matches: [], counts: { total: 0, revealed: 0 }, userType: "freelancer" as const };

    const isFreelancer = profile.user_type === "freelancer";
    const col = isFreelancer ? "freelancer_id" : "team_id";
    const { data: matches, error } = await supabase
      .from("matches")
      .select("*, request:requests(*), freelancer:profiles!matches_freelancer_id_fkey(id, display_name, avatar_url), team:profiles!matches_team_id_fkey(id, display_name, avatar_url)")
      .eq(col, userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rawMatches = (matches ?? []) as any[];
    const otherIds = Array.from(new Set(rawMatches.map((m) => (isFreelancer ? m.team_id : m.freelancer_id))));

    const teamProfilesById = new Map<string, any>();
    const freelancerProfilesById = new Map<string, any>();
    const emailsById = new Map<string, string | null>();
    if (otherIds.length) {
      if (isFreelancer) {
        const { data: tps } = await supabase.from("team_profiles").select("*").in("user_id", otherIds);
        (tps ?? []).forEach((p: any) => teamProfilesById.set(p.user_id, p));
      } else {
        const { data: fps } = await supabase.from("freelancer_profiles").select("*").in("user_id", otherIds);
        (fps ?? []).forEach((p: any) => freelancerProfilesById.set(p.user_id, p));
      }
      const revealedOtherIds = Array.from(new Set(
        rawMatches
          .filter((m) => (isFreelancer ? m.revealed_by_freelancer : m.revealed_by_team))
          .map((m) => (isFreelancer ? m.team_id : m.freelancer_id))
      ));
      if (revealedOtherIds.length) {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await Promise.all(revealedOtherIds.map(async (uid) => {
            const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
            emailsById.set(uid, data?.user?.email ?? null);
          }));
        } catch (_e) {
          // ignore email lookup failures
        }
      }
    }

    const redacted = rawMatches.map((m: any) => {
      const revealedByMe = isFreelancer ? m.revealed_by_freelancer : m.revealed_by_team;
      let counterparty: any = null;
      if (revealedByMe) {
        if (isFreelancer) {
          const tp = teamProfilesById.get(m.team_id);
          counterparty = tp ? {
            team_name: tp.team_name,
            team_type: tp.team_type,
            location: tp.location,
            website: tp.website,
            bio: tp.bio,
            primary_discipline: tp.primary_discipline,
            initials: tp.initials,
            contact_email: m.team?.email ?? null,
          } : null;
        } else {
          const fp = freelancerProfilesById.get(m.freelancer_id);
          counterparty = fp ? {
            headline: fp.headline,
            role: fp.role,
            disciplines: fp.disciplines,
            skills: fp.skills,
            location: fp.location,
            day_rate: fp.day_rate,
            bio: fp.bio,
            travels: fp.travels,
            contact_email: m.freelancer?.email ?? null,
          } : null;
        }
      } else {
        if (isFreelancer && m.team) m.team = { display_name: "Hidden Team", avatar_url: null };
        if (!isFreelancer && m.freelancer) m.freelancer = { display_name: "Hidden Specialist", avatar_url: null };
      }
      return { ...m, revealedByMe, counterparty };
    });

    return {
      matches: redacted,
      counts: {
        total: redacted.length,
        revealed: redacted.filter((m: any) => m.revealedByMe).length,
      },
      userType: profile.user_type,
    };
  });

export const revealMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { match_id: string }) => z.object({ match_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("reveal_match", { _match_id: data.match_id });
    if (error) throw new Error(error.message);
    return result;
  });

// ---- Engagements ----
export const proposeEngagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        match_id: z.string().uuid(),
        freelancer_id: z.string().uuid(),
        team_id: z.string().uuid(),
        request_id: z.string().uuid().optional().nullable(),
        start_date: z.string(),
        end_date: z.string(),
        fee: z.number().int().min(0).optional().nullable(),
        notes: z.string().max(500).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (userId !== data.freelancer_id && userId !== data.team_id) throw new Error("Not a party to this match");
    const { data: row, error } = await supabase.from("engagements").insert({ ...data, proposed_by: userId }).select().single();
    if (error) throw new Error(error.message);
    await supabase.from("notifications").insert({
      user_id: userId === data.freelancer_id ? data.team_id : data.freelancer_id,
      kind: "engagement_proposed",
      payload: { engagement_id: row.id },
    });
    return row;
  });

export const confirmEngagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("engagements")
      .update({ status: "confirmed" })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const markEngagementComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: e } = await supabase.from("engagements").select("*").eq("id", data.id).maybeSingle();
    if (!e) throw new Error("Engagement not found");
    let patch: { freelancer_marked_complete?: boolean; team_marked_complete?: boolean };
    if (userId === e.freelancer_id) patch = { freelancer_marked_complete: true };
    else if (userId === e.team_id) patch = { team_marked_complete: true };
    else throw new Error("Not a party");
    const { data: row, error } = await supabase.from("engagements").update(patch).eq("id", data.id).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getMyEngagements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("engagements")
      .select("*, freelancer:profiles!engagements_freelancer_id_fkey(display_name), team:profiles!engagements_team_id_fkey(display_name)")
      .or(`freelancer_id.eq.${userId},team_id.eq.${userId}`)
      .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---- Ratings ----
export const submitRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({
      engagement_id: z.string().uuid(),
      to_user_id: z.string().uuid(),
      stars: z.number().int().min(1).max(5),
      comment: z.string().max(500).optional().nullable(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase.from("ratings").insert({ ...data, from_user_id: userId }).select().single();
    if (error) throw new Error(error.message);
    await supabase.from("notifications").insert({
      user_id: data.to_user_id,
      kind: "rating_received",
      payload: { engagement_id: data.engagement_id, stars: data.stars },
    });
    return row;
  });

// ---- Tokens (mock purchase for now — Stripe wiring is a follow-up) ----
export const purchaseTokensDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { pack: "small" | "medium" | "large" }) =>
    z.object({ pack: z.enum(["small", "medium", "large"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const packs = { small: 10, medium: 50, large: 200 };
    const amount = packs[data.pack];
    const { supabase, userId } = context;
    await supabase.from("token_transactions").insert({
      user_id: userId,
      delta: amount,
      reason: "purchase",
      note: `Demo pack: ${data.pack}`,
    });
    const { data: current } = await supabase.rpc("my_token_balance");
    const nextBalance = ((current as number | null) ?? 0) + amount;
    const { error } = await supabase
      .from("profiles")
      .update({ token_balance: nextBalance })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { balance: nextBalance, added: amount };
  });

export const getTokenHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("token_transactions")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---- Public profile helpers ----
export const getFreelancerRatings = createServerFn({ method: "GET" })
  .validator((data: { user_id: string }) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: rows, error } = await supa.from("ratings").select("stars, created_at").eq("to_user_id", data.user_id).order("created_at", { ascending: false }).limit(20);
    if (error) throw new Error(error.message);
    const avg = rows && rows.length ? rows.reduce((a, r) => a + r.stars, 0) / rows.length : 0;
    return { ratings: rows ?? [], average: Math.round(avg * 10) / 10, count: rows?.length ?? 0 };
  });
