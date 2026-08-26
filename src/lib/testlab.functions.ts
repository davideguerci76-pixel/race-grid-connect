import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PRESET_SIZES,
  generateFreelancers,
  generateRequests,
  generateTeams,
  type Area,
  type Density,
  type Preset,
} from "@/lib/testlab-generator";
import { DISCIPLINES, SKILLS } from "@/lib/paddock";

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

export const getAdminEnvironment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { currentAdminEnv } = await import("@/lib/admin-env.server");
    return { is_test: await currentAdminEnv(supabaseAdmin, context.userId) };
  });

export const setAdminEnvironment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ is_test: z.boolean() }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("admin_env_state" as never) as any).upsert(
      { admin_id: context.userId, is_test: data.is_test, updated_at: new Date().toISOString() },
      { onConflict: "admin_id" },
    );
    if (error) throw new Error(error.message);
    return { is_test: data.is_test };
  });

export const getTestEnvironmentStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const count = async (table: string) => {
      const { count: n } = await (supabaseAdmin.from(table as never) as any)
        .select("*", { count: "exact", head: true })
        .eq("is_test", true);
      return n ?? 0;
    };
    const [profiles, requests, matches, engagements, availability] = await Promise.all([
      count("profiles"),
      count("requests"),
      count("matches"),
      count("engagements"),
      count("availability"),
    ]);
    return { profiles, requests, matches, engagements, availability };
  });

async function pool<T>(items: T[], size: number, worker: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
}

export const generateTestDataset = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        preset: z.enum(["small", "medium", "large", "stress"]),
        area: z.enum(["italy", "europe", "worldwide"]),
        density: z.enum(["sparse", "normal", "dense"]),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const size = PRESET_SIZES[data.preset as Preset];
    const seed = Date.now() % 2147483647;
    const freelancers = generateFreelancers(
      size.freelancers,
      data.area as Area,
      data.density as Density,
      DISCIPLINES,
      SKILLS,
      seed,
    );
    const teams = generateTeams(size.teams, data.area as Area, DISCIPLINES, seed);
    const requests = generateRequests(size.requests, data.area as Area, DISCIPLINES, SKILLS, seed);

    const errors: string[] = [];
    const freelancerIds: string[] = [];
    const teamIds: string[] = [];

    await pool(freelancers, 6, async (f) => {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: f.email,
        password: `Testlab!${Math.random().toString(36).slice(2, 10)}`,
        email_confirm: true,
        user_metadata: { user_type: "freelancer", display_name: f.display_name, is_test: true },
      });
      if (error || !created?.user) {
        errors.push(error?.message ?? "user creation failed");
        return;
      }
      const uid = created.user.id;
      freelancerIds.push(uid);

      await (supabaseAdmin.from("profiles") as any)
        .update({
          is_test: true,
          first_name: f.first_name,
          last_name: f.last_name,
          display_name: f.display_name,
          terms_accepted_at: new Date().toISOString(),
          privacy_accepted_at: new Date().toISOString(),
        })
        .eq("id", uid);

      await (supabaseAdmin.from("freelancer_profiles") as any)
        .update({
          is_test: true,
          role_group: f.role_group,
          sub_roles: f.sub_roles,
          disciplines: f.disciplines,
          skills: f.skills,
          day_rate: f.day_rate,
          years_experience: f.years_experience,
          travels: f.travels,
          headline: f.headline,
          bio: f.bio,
          languages: f.languages,
          location: f.location,
          location_city: f.location_city,
          location_region: f.location_region,
          location_country: f.location_country,
          location_lat: f.location_lat,
          location_lng: f.location_lng,
          calendar_last_updated_at: new Date().toISOString(),
        })
        .eq("user_id", uid);

      if (f.availability.length) {
        const rows = f.availability.map((day) => ({ freelancer_id: uid, day, is_test: true }));
        for (let i = 0; i < rows.length; i += 200) {
          await (supabaseAdmin.from("availability") as any).insert(rows.slice(i, i + 200));
        }
      }
    });

    await pool(teams, 6, async (t) => {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: t.email,
        password: `Testlab!${Math.random().toString(36).slice(2, 10)}`,
        email_confirm: true,
        user_metadata: { user_type: "team", display_name: t.display_name, is_test: true },
      });
      if (error || !created?.user) {
        errors.push(error?.message ?? "team creation failed");
        return;
      }
      const uid = created.user.id;
      teamIds.push(uid);

      await (supabaseAdmin.from("profiles") as any)
        .update({
          is_test: true,
          display_name: t.display_name,
          token_balance: 500,
          terms_accepted_at: new Date().toISOString(),
          privacy_accepted_at: new Date().toISOString(),
        })
        .eq("id", uid);

      await (supabaseAdmin.from("team_profiles") as any)
        .update({
          is_test: true,
          team_name: t.team_name,
          initials: t.initials,
          team_type: t.team_type,
          primary_discipline: t.primary_discipline,
          founded_year: t.founded_year,
          size: t.size,
          bio: t.bio,
          website: t.website,
          vat_number: t.vat_number,
          location: t.location,
          location_city: t.location_city,
          location_region: t.location_region,
          location_country: t.location_country,
          location_lat: t.location_lat,
          location_lng: t.location_lng,
        })
        .eq("user_id", uid);
    });

    let createdRequests = 0;
    if (teamIds.length) {
      for (let i = 0; i < requests.length; i++) {
        const r = requests[i]!;
        const teamId = teamIds[i % teamIds.length]!;
        const { error } = await (supabaseAdmin.from("requests") as any).insert({
          team_id: teamId,
          is_test: true,
          title: r.title,
          discipline: r.discipline,
          duration: r.duration,
          role_group: r.role_group,
          sub_role: r.sub_role,
          sub_role_min_level: r.sub_role_min_level,
          sub_role_hard: false,
          role_hard: true,
          skills: r.skills,
          skills_hard: r.skills_hard,
          start_date: r.start_date,
          end_date: r.end_date,
          season_dates: r.season_dates,
          budget_min: r.budget_min,
          budget_max: r.budget_max,
          budget_unit: "day",
          currency: "EUR",
          travel_required: r.travel_required,
          notes: r.notes,
          location: r.location,
          location_city: r.location_city,
          location_region: r.location_region,
          location_country: r.location_country,
          location_lat: r.location_lat,
          location_lng: r.location_lng,
          location_relevance: "relevant",
          location_anchor: "this",
          location_radius_km: 500,
          search_mode: "standard",
          status: "active",
          is_active: true,
        });
        if (error) errors.push(error.message);
        else createdRequests++;
      }
    }

    await supabaseAdmin.rpc("recompute_matches", { _freelancer_id: null, _request_id: null } as never);

    await (supabaseAdmin.from("admin_audit_log") as any).insert({
      admin_id: context.userId,
      action: "testlab_generate",
      details: { preset: data.preset, area: data.area, density: data.density, freelancers: freelancerIds.length, teams: teamIds.length, requests: createdRequests },
    });

    return {
      freelancers: freelancerIds.length,
      teams: teamIds.length,
      requests: createdRequests,
      errors: errors.slice(0, 5),
    };
  });

export const purgeTestEnvironment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ confirm: z.literal("DELETE TEST DATA") }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error } = await (supabaseAdmin.from("profiles") as any)
      .select("id")
      .eq("is_test", true);
    if (error) throw new Error(error.message);

    const ids: string[] = (profiles ?? []).map((p: any) => String(p.id));
    let deleted = 0;
    await pool(ids, 6, async (id) => {
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (!delErr) deleted++;
    });

    await supabaseAdmin.rpc("purge_test_environment" as never);

    await (supabaseAdmin.from("admin_audit_log") as any).insert({
      admin_id: context.userId,
      action: "testlab_purge",
      details: { users_deleted: deleted },
    });

    return { users_deleted: deleted };
  });

// ==================== TESTING LAB — POOL SIMULATION ====================

export const assignTestPools = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error } = await (supabaseAdmin.from("profiles") as any)
      .select("id, user_type")
      .eq("is_test", true);
    if (error) throw new Error(error.message);

    const teams: string[] = (profiles ?? []).filter((p: any) => p.user_type === "team").map((p: any) => String(p.id));
    const frees: string[] = (profiles ?? []).filter((p: any) => p.user_type === "freelancer").map((p: any) => String(p.id));
    if (!teams.length || !frees.length) throw new Error("No TEST teams or freelancers found. Generate a dataset first.");

    const rows: { team_id: string; freelancer_id: string; source: string }[] = [];
    teams.forEach((teamId, ti) => {
      const size = Math.min(frees.length, 3 + (ti % 3));
      for (let k = 0; k < size; k++) {
        const f = frees[(ti * 3 + k) % frees.length]!;
        rows.push({ team_id: teamId, freelancer_id: f, source: "code" });
      }
    });

    const { error: insErr } = await (supabaseAdmin.from("team_pool") as any)
      .upsert(rows, { onConflict: "team_id,freelancer_id", ignoreDuplicates: true });
    if (insErr) throw new Error(insErr.message);

    const { count } = await (supabaseAdmin.from("team_pool") as any)
      .select("*", { count: "exact", head: true })
      .eq("is_test", true);

    await (supabaseAdmin.from("admin_audit_log") as any).insert({
      admin_id: context.userId,
      action: "testlab_assign_pools",
      details: { teams: teams.length, links: rows.length },
    });

    return { teams: teams.length, links: rows.length, pool_total: count ?? 0 };
  });

export const generatePoolRatings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: members, error } = await (supabaseAdmin.from("team_pool") as any)
      .select("team_id, freelancer_id, engagement_id")
      .eq("is_test", true);
    if (error) throw new Error(error.message);
    if (!members?.length) throw new Error("No TEST pool members found. Run \"Add to pool\" first.");

    const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    let engagements = 0;
    let ratings = 0;
    const errors: string[] = [];

    for (let i = 0; i < members.length; i++) {
      const m = members[i]!;
      let engagementId: string | null = m.engagement_id ?? null;

      if (!engagementId) {
        const { data: existing } = await (supabaseAdmin.from("engagements") as any)
          .select("id")
          .eq("team_id", m.team_id)
          .eq("freelancer_id", m.freelancer_id)
          .eq("status", "completed")
          .limit(1)
          .maybeSingle();
        engagementId = existing?.id ?? null;
      }

      if (!engagementId) {
        const startOffset = -(20 + (i % 40));
        const { data: created, error: engErr } = await (supabaseAdmin.from("engagements") as any)
          .insert({
            team_id: m.team_id,
            freelancer_id: m.freelancer_id,
            proposed_by: m.team_id,
            start_date: day(startOffset),
            end_date: day(startOffset + 2),
            fee: 400 + (i % 8) * 50,
            currency: "EUR",
            status: "confirmed",
            freelancer_marked_complete: true,
            team_marked_complete: true,
            confirmed_at: new Date(Date.now() + startOffset * 86400000).toISOString(),
            notes: "Testing Lab — synthetic completed engagement.",
          })
          .select("id")
          .maybeSingle();
        if (engErr || !created) {
          errors.push(engErr?.message ?? "engagement creation failed");
          continue;
        }
        engagementId = created.id;
        engagements++;
      }

      const { data: existingRatings } = await (supabaseAdmin.from("ratings") as any)
        .select("from_user_id")
        .eq("engagement_id", engagementId);
      const already = new Set((existingRatings ?? []).map((r: any) => String(r.from_user_id)));

      const score = (base: number) => Math.round((base + ((i % 5) * 0.2)) * 10) / 10;
      const rows: any[] = [];
      if (!already.has(String(m.team_id))) {
        const overall = Math.min(5, score(3.4));
        rows.push({
          engagement_id: engagementId,
          from_user_id: m.team_id,
          to_user_id: m.freelancer_id,
          stars: Math.round(overall),
          overall,
          sub_scores: {
            technical: Math.min(5, score(3.6)),
            punctuality: Math.min(5, score(3.2)),
            stress: Math.min(5, score(3.8)),
          },
          comment: "Testing Lab — synthetic team feedback on the freelancer.",
          unlocked_at: new Date().toISOString(),
          moderation_status: "active",
        });
      }
      if (!already.has(String(m.freelancer_id))) {
        const overall = Math.min(5, score(3.6));
        rows.push({
          engagement_id: engagementId,
          from_user_id: m.freelancer_id,
          to_user_id: m.team_id,
          stars: Math.round(overall),
          overall,
          sub_scores: {},
          comment: "Testing Lab — synthetic freelancer feedback on the team.",
          unlocked_at: new Date().toISOString(),
          moderation_status: "active",
        });
      }
      if (rows.length) {
        const { error: rErr } = await (supabaseAdmin.from("ratings") as any).insert(rows);
        if (rErr) errors.push(rErr.message);
        else ratings += rows.length;
      }
    }

    await (supabaseAdmin.from("admin_audit_log") as any).insert({
      admin_id: context.userId,
      action: "testlab_pool_ratings",
      details: { engagements, ratings },
    });

    return { engagements, ratings, errors: errors.slice(0, 5) };
  });

export const generatePoolPitCalls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: members, error } = await (supabaseAdmin.from("team_pool") as any)
      .select("team_id, freelancer_id")
      .eq("is_test", true);
    if (error) throw new Error(error.message);
    if (!members?.length) throw new Error("No TEST pool members found. Run \"Add to pool\" first.");

    const byTeam = new Map<string, string[]>();
    for (const m of members) {
      const list = byTeam.get(String(m.team_id)) ?? [];
      list.push(String(m.freelancer_id));
      byTeam.set(String(m.team_id), list);
    }

    const { count: teamCount } = await (supabaseAdmin.from("profiles") as any)
      .select("*", { count: "exact", head: true })
      .eq("is_test", true)
      .eq("user_type", "team");
    const target = Math.max(1, Math.ceil((teamCount ?? byTeam.size) / 2));

    const teamIds = Array.from(byTeam.keys());
    const errors: string[] = [];
    let created = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (let i = 0; created < target && i < target * 3; i++) {
      const teamId = teamIds[i % teamIds.length]!;
      const poolIds = byTeam.get(teamId)!;
      const freelancerId = poolIds[i % poolIds.length]!;

      const { data: fp } = await (supabaseAdmin.from("freelancer_profiles") as any)
        .select("role_group, sub_roles, skills, disciplines, location, location_city, location_region, location_country, location_lat, location_lng, day_rate")
        .eq("user_id", freelancerId)
        .maybeSingle();
      const { data: days } = await (supabaseAdmin.from("availability") as any)
        .select("day")
        .eq("freelancer_id", freelancerId)
        .gte("day", today)
        .order("day", { ascending: true })
        .limit(3);

      const dayList: string[] = (days ?? []).map((d: any) => String(d.day));
      if (!fp || dayList.length === 0) continue;

      const subRole = (fp.sub_roles ?? [])[0]?.sub_role ?? null;
      const skills: string[] = (fp.skills ?? []).slice(0, 3);
      const { error: reqErr } = await (supabaseAdmin.from("requests") as any).insert({
        team_id: teamId,
        is_test: true,
        title: `Pool Pit Call — ${(subRole ?? "crew").replace(/_/g, " ")} · ${fp.location_city ?? "remote"}`,
        discipline: (fp.disciplines ?? ["gt3"])[0] ?? "gt3",
        duration: "race_weekend",
        role_group: fp.role_group,
        sub_role: subRole,
        sub_role_min_level: "junior",
        sub_role_hard: false,
        role_hard: false,
        skills,
        skills_hard: [],
        start_date: dayList[0],
        end_date: dayList[dayList.length - 1],
        season_dates: null,
        budget_min: Math.max(100, (fp.day_rate ?? 400) - 100),
        budget_max: (fp.day_rate ?? 400) + 200,
        budget_unit: "day",
        currency: "EUR",
        travel_required: false,
        notes: "Testing Lab — synthetic My Pool Pit Call targeted at pool members.",
        location: fp.location,
        location_city: fp.location_city,
        location_region: fp.location_region,
        location_country: fp.location_country,
        location_lat: fp.location_lat,
        location_lng: fp.location_lng,
        location_relevance: "relevant",
        location_anchor: "this",
        location_radius_km: 500,
        search_mode: "pool",
        status: "active",
        is_active: true,
      });
      if (reqErr) errors.push(reqErr.message);
      else created++;
    }

    await supabaseAdmin.rpc("recompute_matches", { _freelancer_id: null, _request_id: null } as never);

    await (supabaseAdmin.from("admin_audit_log") as any).insert({
      admin_id: context.userId,
      action: "testlab_pool_pitcalls",
      details: { created, target },
    });

    return { created, target, errors: errors.slice(0, 5) };
  });
