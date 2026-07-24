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
        education: z.string().max(64).optional().nullable(),
        day_rate: z.number().int().min(0).optional().nullable(),
        location: z.string().max(140).optional().nullable(),
        bio: z.string().max(1200).optional().nullable(),
        travels: z.boolean(),
        // phone is edited separately via updateMyPhone (stored in owner-only freelancer_contacts)
        experiences: z
          .array(
            z.object({
              discipline: disciplineEnum,
              years: z.number().int().min(0).max(11),
            }),
          )
          .max(5)
          .optional(),
        languages: z
          .array(
            z.object({
              code: z.string().min(1).max(24),
              level: z.enum(["basic", "intermediate", "advanced", "fluent", "native"]),
              custom: z.string().max(60).optional().nullable(),
            }),
          )
          .max(10)
          .optional(),
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
        education: data.education || null,
        day_rate: data.day_rate ?? null,
        location: data.location || null,
        bio: data.bio || null,
        travels: data.travels,
        experiences: data.experiences ?? [],
        languages: data.languages ?? [],
      } as never,
      { onConflict: "user_id" },
    ).select("*").single();
    if (error) throw new Error(error.message);

    return row;
  });

export const updateMyPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        phone_dial_code: z.string().trim().regex(/^\+\d{1,4}$/, "INVALID_PHONE").max(6),
        phone_number: z.string().trim().min(4, "INVALID_PHONE").max(30).regex(/^[0-9 ()\-./]+$/, "INVALID_PHONE"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("freelancer_contacts").upsert(
      { user_id: context.userId, phone_dial_code: data.phone_dial_code, phone_number: data.phone_number } as never,
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
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
        role_hard: z.boolean().optional().default(true),
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
        skills_hard: z.array(z.string().max(64)).max(50).optional(),
        education: z.array(z.string().max(64)).max(20).optional(),
        travel_required: z.boolean().optional().default(true),
        experience_requirements: z
          .array(
            z.object({
              discipline: disciplineEnum,
              min_years: z.number().int().min(0).max(11),
              hard: z.boolean(),
            }),
          )
          .max(3)
          .optional(),
        languages: z
          .array(
            z.object({
              code: z.string().min(1).max(24),
              level: z.enum(["basic", "intermediate", "advanced", "fluent", "native"]),
              hard: z.boolean(),
              custom: z.string().max(60).optional().nullable(),
            }),
          )
          .max(6)
          .optional(),
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
      skills_hard: data.skills_hard ?? [],
      education: data.education ?? [],
      experience_requirements: data.experience_requirements ?? [],
      languages: data.languages ?? [],
      role_hard: data.role_hard ?? true,
      travel_required: data.travel_required ?? true,
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

    // Fetch pending "proposed" engagements addressed to the current user
    const matchIds = rawMatches.map((m: any) => m.id);
    const pendingByMatchId = new Map<string, string>();
    if (matchIds.length) {
      const { data: eng } = await supabase
        .from("engagements")
        .select("id, match_id, status, proposed_by")
        .in("match_id", matchIds)
        .eq("status", "proposed")
        .neq("proposed_by", userId);
      (eng ?? []).forEach((e: any) => { if (e.match_id) pendingByMatchId.set(e.match_id, e.id); });
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
            contact_email: emailsById.get(m.team_id) ?? null,
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
            contact_email: emailsById.get(m.freelancer_id) ?? null,
          } : null;
        }
      } else {
        if (isFreelancer && m.team) m.team = { display_name: "Hidden Team", avatar_url: null };
        if (!isFreelancer && m.freelancer) m.freelancer = { display_name: "Hidden Specialist", avatar_url: null };
      }
      return { ...m, revealedByMe, counterparty, pending_engagement_id: pendingByMatchId.get(m.id) ?? null };
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
    // Uses the accept RPC which also fills the request and auto-unlocks contacts
    const { data: row, error } = await context.supabase.rpc("accept_match_confirmation", { _engagement_id: data.id });
    if (error) throw new Error(error.message);
    return row;
  });

export const requestMatchConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { match_id: string }) => z.object({ match_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("request_match_confirmation", { _match_id: data.match_id });
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
      .select("*, freelancer:profiles!engagements_freelancer_id_fkey(display_name), team:profiles!engagements_team_id_fkey(display_name), request:requests(id, title, role, discipline, start_date, end_date, skills, skills_hard, education, languages, budget_min, budget_max, budget_unit, notes, location, circuit), match:matches(id, match_score, is_perfect, overlap_days, missing_criteria)")
      .or(`freelancer_id.eq.${userId},team_id.eq.${userId}`)
      .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const teamIds = Array.from(new Set(rows.map((r) => r.team_id)));
    const freelancerIds = Array.from(new Set(rows.map((r) => r.freelancer_id)));
    const [tpsRes, fpsRes] = await Promise.all([
      teamIds.length
        ? supabase.from("team_profiles").select("user_id, team_name, team_type, location, website, bio, primary_discipline").in("user_id", teamIds)
        : Promise.resolve({ data: [] as any[] } as any),
      freelancerIds.length
        ? supabase.from("freelancer_profiles").select("user_id, headline, role, location, day_rate, disciplines, skills, bio, travels").in("user_id", freelancerIds)
        : Promise.resolve({ data: [] as any[] } as any),
    ]);
    const tpMap = new Map(((tpsRes.data ?? []) as any[]).map((r: any) => [r.user_id, r]));
    const fpMap = new Map(((fpsRes.data ?? []) as any[]).map((r: any) => [r.user_id, r]));
    return rows.map((r) => ({
      ...r,
      team_profile: tpMap.get(r.team_id) ?? null,
      freelancer_profile: fpMap.get(r.freelancer_id) ?? null,
    }));
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

// ---- Team match view per request (v2 scoring + token unlocks) ----
export const getRequestMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { request_id: string; page?: number }) =>
    z.object({ request_id: z.string().uuid(), page: z.number().int().min(1).max(200).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const page = data.page ?? 1;
    const pageSize = 10;

    const { data: req, error: reqErr } = await supabase
      .from("requests")
      .select("*")
      .eq("id", data.request_id)
      .maybeSingle();
    if (reqErr) throw new Error(reqErr.message);
    if (!req) throw new Error("Request not found");
    if (req.team_id !== userId) throw new Error("Not owner of this request");

    const { data: allMatches, error: mErr } = await supabase
      .from("matches")
      .select("*")
      .eq("request_id", data.request_id)
      .order("match_score", { ascending: false })
      .order("created_at", { ascending: true });
    if (mErr) throw new Error(mErr.message);

    const rows = allMatches ?? [];
    const total = rows.length;
    const topThreeIds = new Set(rows.slice(0, 3).map((m: any) => m.id));

    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    const freelancerIds = pageRows.map((m: any) => m.freelancer_id);
    const [{ data: fps }, { data: profs }, { data: unlocks }] = await Promise.all([
      supabase.from("freelancer_profiles").select("*").in("user_id", freelancerIds.length ? freelancerIds : ["00000000-0000-0000-0000-000000000000"]),
      supabase.from("profiles").select("id, display_name, avatar_url").in("id", freelancerIds.length ? freelancerIds : ["00000000-0000-0000-0000-000000000000"]),
      supabase.from("match_unlocks").select("match_id, free_preview").eq("team_id", userId).in("match_id", pageRows.map((m: any) => m.id).length ? pageRows.map((m: any) => m.id) : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const fpMap = new Map((fps ?? []).map((r: any) => [r.user_id, r]));
    const profMap = new Map((profs ?? []).map((r: any) => [r.id, r]));
    const unlockMap = new Map((unlocks ?? []).map((r: any) => [r.match_id, r]));

    // Fetch emails/phones only for unlocked candidates
    const unlockedIds = pageRows.filter((m: any) => unlockMap.has(m.id)).map((m: any) => m.freelancer_id);
    const emailMap = new Map<string, string | null>();
    const phoneMap = new Map<string, { phone_dial_code: string | null; phone_number: string | null }>();
    if (unlockedIds.length) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: contacts } = await supabaseAdmin
          .from("freelancer_contacts")
          .select("user_id, phone_dial_code, phone_number")
          .in("user_id", unlockedIds);
        (contacts ?? []).forEach((c: any) => phoneMap.set(c.user_id, { phone_dial_code: c.phone_dial_code, phone_number: c.phone_number }));
        await Promise.all(unlockedIds.map(async (uid) => {
          const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
          emailMap.set(uid, data?.user?.email ?? null);
        }));
      } catch {
        // ignore
      }
    }

    const items = pageRows.map((m: any) => {
      const unlocked = unlockMap.has(m.id) || topThreeIds.has(m.id);
      const wasFree = unlockMap.get(m.id)?.free_preview ?? topThreeIds.has(m.id);
      const prof = profMap.get(m.freelancer_id);
      const fp = fpMap.get(m.freelancer_id);
      return {
        match_id: m.id,
        match_score: Number(m.match_score ?? 0),
        is_perfect: m.is_perfect,
        overlap_days: m.overlap_days,
        missing_criteria: m.missing_criteria ?? [],
        unlocked,
        free_preview: wasFree,
        freelancer_id: m.freelancer_id,
        profile: unlocked
          ? {
              display_name: prof?.display_name ?? "Freelancer",
              avatar_url: prof?.avatar_url ?? null,
              headline: fp?.headline ?? null,
              role: fp?.role ?? null,
              disciplines: fp?.disciplines ?? [],
              skills: fp?.skills ?? [],
              location: fp?.location ?? null,
              day_rate: fp?.day_rate ?? null,
              bio: fp?.bio ?? null,
              travels: fp?.travels ?? false,
              education: fp?.education ?? null,
              experiences: fp?.experiences ?? [],
              languages: fp?.languages ?? [],
              contact_email: emailMap.get(m.freelancer_id) ?? null,
              phone_dial_code: phoneMap.get(m.freelancer_id)?.phone_dial_code ?? null,
              phone_number: phoneMap.get(m.freelancer_id)?.phone_number ?? null,
            }
          : null,
      };
    });

    return {
      request: req,
      items,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  });

export const unlockMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { match_id: string }) => z.object({ match_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: balance, error } = await context.supabase.rpc("unlock_match_for_team", { _match_id: data.match_id });
    if (error) throw new Error(error.message);
    return { balance: balance as number };
  });

// ---- Notifications ----
export const getUnreadNotificationCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


