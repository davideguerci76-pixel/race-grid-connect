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

    const ids = (profiles ?? []).map((p: any) => p.id as string);
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
