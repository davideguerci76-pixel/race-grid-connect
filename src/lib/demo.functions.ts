import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEMO_SCENARIO_LIST, getScenario } from "@/lib/demo/scenarios";
import type { DemoCanonicalPitCall, DemoScenario } from "@/lib/demo/scenarios/types";
import { computeAnchor, resolveDay, resolveDays, todayISO } from "@/lib/demo/anchor";

// =====================================================================
// DEMO scenarios — generic seeder / verifier / guide data.
// Authority: profiles.is_test. Every service_role query below is explicitly
// scoped to the TEST environment; LIVE is never read for writes nor touched.
// =====================================================================

const TEST_EMAIL_DOMAIN = "test-pitcall.invalid";

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

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const emailFor = (scenarioId: string, key: string) => `demo-${scenarioId}-${key}@${TEST_EMAIL_DOMAIN}`;
const password = () => `Demo!${Math.random().toString(36).slice(2, 12)}A1`;

/** Every persona display name carries the cosmetic DEMO prefix. */
const teamDisplayName = (t: { team_name: string }) => t.team_name;
const freelancerDisplayName = (f: { first_name: string; last_name: string }) => `${f.first_name} ${f.last_name}`;

// ---------------------------------------------------------------- taxonomy

async function validateTaxonomy(sb: any, scenario: DemoScenario) {
  const [{ data: groups }, { data: subs }, { data: skills }, { data: langs }] = await Promise.all([
    sb.from("taxonomy_role_groups").select("code").eq("is_active", true),
    sb.from("taxonomy_sub_roles").select("code, role_group_code").eq("is_active", true),
    sb.from("taxonomy_skills").select("code").eq("is_active", true),
    sb.from("taxonomy_languages").select("code").eq("is_active", true),
  ]);
  const G = new Set((groups ?? []).map((r: any) => r.code));
  const S = new Set((subs ?? []).map((r: any) => `${r.role_group_code}:${r.code}`));
  const K = new Set((skills ?? []).map((r: any) => r.code));
  const L = new Set((langs ?? []).map((r: any) => r.code));

  const problems: string[] = [];
  const checkGroup = (g: string, where: string) => {
    if (!G.has(g)) problems.push(`${where}: unknown role_group "${g}"`);
  };
  const checkSub = (g: string, s: string, where: string) => {
    if (!S.has(`${g}:${s}`)) problems.push(`${where}: unknown sub_role "${s}" for role group "${g}"`);
  };
  const checkSkills = (list: string[], where: string) =>
    list.forEach((s) => {
      if (!K.has(s)) problems.push(`${where}: unknown skill "${s}"`);
    });
  const checkLangs = (list: { code: string }[], where: string) =>
    list.forEach((l) => {
      if (!L.has(l.code)) problems.push(`${where}: unknown language "${l.code}"`);
    });

  for (const f of scenario.freelancers) {
    checkGroup(f.role_group, `freelancer ${f.key}`);
    f.sub_roles.forEach((sr) => checkSub(f.role_group, sr.sub_role, `freelancer ${f.key}`));
    checkSkills(f.skills, `freelancer ${f.key}`);
    checkLangs(f.languages, `freelancer ${f.key}`);
  }
  for (const p of scenario.canonicalPitCalls) {
    checkGroup(p.input.role_group, `pit call ${p.key}`);
    checkSub(p.input.role_group, p.input.sub_role, `pit call ${p.key}`);
    checkSkills([...p.input.skills, ...p.input.skills_hard], `pit call ${p.key}`);
    checkLangs(p.input.languages, `pit call ${p.key}`);
  }
  const sos = scenario.preSeeded.sos.request;
  checkGroup(sos.role_group, "sos request");
  checkSub(sos.role_group, sos.sub_role, "sos request");
  checkSkills(sos.skills, "sos request");

  if (problems.length) {
    throw new Error(`Taxonomy validation failed (${problems.length}): ${problems.slice(0, 6).join(" | ")}`);
  }
}

// ---------------------------------------------------------------- purge

async function purgeTestScope(sb: any) {
  const { data: profiles, error } = await sb.from("profiles").select("id").eq("is_test", true);
  if (error) throw new Error(error.message);
  const ids: string[] = (profiles ?? []).map((p: any) => String(p.id));

  // Safety net: any leftover account on the non-routable demo domain is removed too,
  // even if a previous failed run left it without the TEST flag.
  try {
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of list?.users ?? []) {
      const mail = String(u.email ?? "");
      if (mail.endsWith(`@${TEST_EMAIL_DOMAIN}`) && !ids.includes(String(u.id))) ids.push(String(u.id));
    }
  } catch {
    /* listing is best-effort */
  }

  // Sequential with one retry: parallel cascades race on shared child rows and
  // silently leave accounts behind, which then breaks the next seed on a taken email.
  for (const id of ids) {
    let { error: delErr } = await sb.auth.admin.deleteUser(id);
    if (delErr) ({ error: delErr } = await sb.auth.admin.deleteUser(id));
    if (delErr) throw new Error(`Cannot delete test account ${id}: ${delErr.message || "unknown error"}`);
  }


  const { error: purgeErr } = await sb.rpc("purge_test_environment");
  if (purgeErr) throw new Error(`purge_test_environment failed: ${purgeErr.message}`);
  return ids.length;
}

// ---------------------------------------------------------------- seeding

async function createTestUser(sb: any, email: string, userType: "team" | "freelancer", displayName: string) {
  const { data: created, error } = await sb.auth.admin.createUser({
    email,
    password: password(),
    email_confirm: true,
    user_metadata: { user_type: userType, display_name: displayName, is_test: true },
  });
  if (error || !created?.user) throw new Error(`Cannot create ${email}: ${error?.message ?? "unknown error"}`);
  return String(created.user.id);
}

async function seedScenario(sb: any, scenario: DemoScenario, adminId: string) {
  const now = new Date();
  const anchor = computeAnchor(now);
  const today = todayISO(now);
  const stamp = new Date().toISOString();
  const personas: Record<string, string> = {};

  // ---- teams
  for (const t of scenario.teams) {
    const uid = await createTestUser(sb, emailFor(scenario.id, t.key), "team", teamDisplayName(t));
    personas[t.key] = uid;

    await sb
      .from("profiles")
      .update({
        is_test: true,
        display_name: teamDisplayName(t),
        terms_accepted_at: stamp,
        privacy_accepted_at: stamp,
      })
      .eq("id", uid);

    await sb
      .from("team_profiles")
      .update({
        is_test: true,
        team_name: t.team_name,
        initials: t.initials,
        team_type: t.team_type,
        primary_discipline: t.primary_discipline,
        founded_year: t.founded_year,
        size: t.size,
        bio: t.bio.en,
        website: `https://www.${t.key}.example`,
        vat_number: `TESTDEMO${t.key.toUpperCase()}`,
        location: `${t.city.city}, ${t.city.country}`,
        location_city: t.city.city,
        location_region: t.city.region,
        location_country: t.city.country,
        location_lat: t.city.lat,
        location_lng: t.city.lng,
      })
      .eq("user_id", uid);

    const { error: creditErr } = await sb.rpc("credit_tokens", {
      _user_id: uid,
      _delta: t.tokens,
      _reason: "admin_credit",
      _ref: null,
      _note: `DEMO ${scenario.id} seed`,
    });
    if (creditErr) throw new Error(`credit_tokens failed for ${t.key}: ${creditErr.message}`);
  }

  // ---- freelancers
  for (const f of scenario.freelancers) {
    const uid = await createTestUser(sb, emailFor(scenario.id, f.key), "freelancer", freelancerDisplayName(f));
    personas[f.key] = uid;

    await sb
      .from("profiles")
      .update({
        is_test: true,
        first_name: f.first_name,
        last_name: f.last_name,
        display_name: freelancerDisplayName(f),
        terms_accepted_at: stamp,
        privacy_accepted_at: stamp,
      })
      .eq("id", uid);

    await sb
      .from("freelancer_profiles")
      .update({
        is_test: true,
        role_group: f.role_group,
        sub_roles: f.sub_roles,
        disciplines: f.disciplines,
        skills: f.skills,
        languages: f.languages,
        experiences: f.experiences,
        day_rate: f.day_rate,
        years_experience: f.years_experience,
        travels: f.travels,
        headline: f.headline.en,
        bio: f.headline.en,
        location: `${f.city.city}, ${f.city.country}`,
        location_city: f.city.city,
        location_region: f.city.region,
        location_country: f.city.country,
        location_lat: f.city.lat,
        location_lng: f.city.lng,
        calendar_last_updated_at: stamp,
        calendar_last_confirmed_at: stamp,
      })
      .eq("user_id", uid);

    const days = resolveDays(anchor, f.availability, now);
    if (days.length) {
      const { error: availErr } = await sb
        .from("availability")
        .insert(days.map((day) => ({ freelancer_id: uid, day, is_test: true })));
      if (availErr) throw new Error(`availability insert failed for ${f.key}: ${availErr.message}`);
    }
  }

  // ---- pool links
  const poolRows: any[] = [];
  for (const f of scenario.freelancers) {
    for (const teamKey of f.pool_of ?? []) {
      poolRows.push({ team_id: personas[teamKey], freelancer_id: personas[f.key], source: "code", is_test: true });
    }
  }
  if (poolRows.length) {
    const { error: poolErr } = await sb
      .from("team_pool")
      .upsert(poolRows, { onConflict: "team_id,freelancer_id", ignoreDuplicates: true });
    if (poolErr) throw new Error(`team_pool seed failed: ${poolErr.message}`);
  }

  // ---- pre-seeded SOS situation, built through the real cancellation law
  const sos = scenario.preSeeded.sos;
  const teamId = personas[sos.team]!;
  const noShowId = personas[sos.noShowFreelancer]!;

  const { data: sosRequest, error: reqErr } = await sb
    .from("requests")
    .insert({
      team_id: teamId,
      is_test: true,
      title: sos.request.title.en,
      discipline: sos.request.discipline,
      duration: "race_weekend",
      role_group: sos.request.role_group,
      sub_role: sos.request.sub_role,
      sub_role_min_level: sos.request.sub_role_min_level,
      sub_role_hard: false,
      role_hard: true,
      skills: sos.request.skills,
      skills_hard: [],
      start_date: today,
      end_date: today,
      season_dates: null,
      budget_min: sos.request.budget_min,
      budget_max: sos.request.budget_max,
      budget_unit: "day",
      currency: "EUR",
      travel_required: true,
      notes: "DEMO scenario — pre-seeded SOS situation.",
      location: `${sos.request.location.city}, ${sos.request.location.country}`,
      location_city: sos.request.location.city,
      location_region: sos.request.location.region,
      location_country: sos.request.location.country,
      location_lat: sos.request.location.lat,
      location_lng: sos.request.location.lng,
      location_relevance: "relevant",
      location_anchor: "this",
      location_radius_km: sos.request.location_radius_km,
      search_mode: "standard",
      status: "active",
      is_active: true,
      activated_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (reqErr || !sosRequest) throw new Error(`SOS request seed failed: ${reqErr?.message ?? "no row"}`);

  // The professional had confirmed three days ago (outside the grace window)...
  const { data: engagement, error: engErr } = await sb
    .from("engagements")
    .insert({
      team_id: teamId,
      freelancer_id: noShowId,
      request_id: sosRequest.id,
      proposed_by: teamId,
      start_date: today,
      end_date: today,
      covered_days: [today],
      fee: 450,
      currency: "EUR",
      status: "confirmed",
      confirmed_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      notes: "DEMO scenario — engagement later abandoned by the professional.",
      is_test: true,
    })
    .select("id")
    .maybeSingle();
  if (engErr || !engagement) throw new Error(`SOS engagement seed failed: ${engErr?.message ?? "no row"}`);

  // ...and pulls out late today: this runs the REAL cancellation law, which
  // reopens the Pit Call and makes it legitimately SOS-eligible.
  const { error: cancelErr } = await sb.rpc("demo_cancel_engagement_test", {
    _engagement_id: engagement.id,
    _actor: noShowId,
    _reason: "DEMO scenario — professional pulled out on the event day.",
  });
  if (cancelErr) throw new Error(`demo_cancel_engagement_test failed: ${cancelErr.message}`);

  // ---- real matching engine, TEST scope only
  const { error: recErr } = await sb.rpc("recompute_matches_env", { _is_test: true });
  if (recErr) throw new Error(`recompute_matches_env failed: ${recErr.message}`);

  await sb.from("admin_audit_log").insert({
    admin_id: adminId,
    action: "demo_seed",
    details: { scenario: scenario.id, version: scenario.version, anchor, personas: Object.keys(personas).length },
  });

  return { anchor, today, personas, sosRequestId: String(sosRequest.id), sosEngagementId: String(engagement.id) };
}

// ---------------------------------------------------------------- verification

type ProbeRow = { key: string; partial: boolean; missing_days: number; skills_score: number; final_score: number };

type Assertion = { name: string; expected: string; verified: string; pass: boolean };

async function probePitCall(
  sb: any,
  scenario: DemoScenario,
  pc: DemoCanonicalPitCall,
  personas: Record<string, string>,
  anchor: string,
  now: Date,
): Promise<ProbeRow[]> {
  const days = resolveDays(anchor, pc.input.days, now);
  const { data: req, error } = await sb
    .from("requests")
    .insert({
      team_id: personas[pc.team],
      is_test: true,
      title: `DEMO verification probe — ${pc.key}`,
      discipline: pc.input.discipline,
      duration: pc.input.duration,
      role_group: pc.input.role_group,
      sub_role: pc.input.sub_role,
      sub_role_min_level: pc.input.sub_role_min_level,
      sub_role_hard: pc.input.sub_role_hard,
      role_hard: pc.input.role_hard,
      skills: pc.input.skills,
      skills_hard: pc.input.skills_hard,
      languages: pc.input.languages,
      start_date: days[0],
      end_date: days[days.length - 1],
      season_dates: null,
      budget_min: pc.input.budget_min,
      budget_max: pc.input.budget_max,
      budget_unit: "day",
      currency: "EUR",
      travel_required: pc.input.travel_required,
      notes: "DEMO verification probe — deleted immediately after verification.",
      location: `${pc.input.location.city}, ${pc.input.location.country}`,
      location_city: pc.input.location.city,
      location_region: pc.input.location.region,
      location_country: pc.input.location.country,
      location_lat: pc.input.location.lat,
      location_lng: pc.input.location.lng,
      location_relevance: pc.input.location_relevance,
      location_anchor: "this",
      location_radius_km: pc.input.location_radius_km,
      search_mode: pc.input.search_mode,
      status: "active",
      is_active: true,
      activated_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (error || !req) throw new Error(`probe request failed for ${pc.key}: ${error?.message ?? "no row"}`);

  const probeId = String(req.id);
  try {
    const { error: recErr } = await sb.rpc("recompute_matches", { _freelancer_id: null, _request_id: probeId });
    if (recErr) throw new Error(`probe recompute failed for ${pc.key}: ${recErr.message}`);

    const { data: matches, error: mErr } = await sb
      .from("matches")
      .select("freelancer_id, is_partial, missing_days, skills_score, final_score, stale")
      .eq("request_id", probeId)
      .eq("is_test", true);
    if (mErr) throw new Error(mErr.message);

    const byId = new Map<string, string>();
    Object.entries(personas).forEach(([k, id]) => byId.set(id, k));

    // Pool-origin Pit Calls: the engine scores everybody, the product surface shows
    // only pool members. Verify what the team actually sees.
    let poolFilter: Set<string> | null = null;
    if (pc.input.search_mode === "pool") {
      const { data: poolRows } = await sb
        .from("team_pool")
        .select("freelancer_id")
        .eq("team_id", personas[pc.team]);
      poolFilter = new Set((poolRows ?? []).map((r: any) => String(r.freelancer_id)));
    }

    return (matches ?? [])
      .filter((m: any) => m.stale === false)
      .filter((m: any) => !poolFilter || poolFilter.has(String(m.freelancer_id)))
      .map((m: any) => ({
        key: byId.get(String(m.freelancer_id)) ?? String(m.freelancer_id),
        partial: Boolean(m.is_partial),
        missing_days: Number(m.missing_days),
        skills_score: Number(m.skills_score),
        final_score: Number(m.final_score),
      }))
      .sort((a: any, b: any) => b.final_score - a.final_score);
  } finally {
    await sb.from("matches").delete().eq("request_id", probeId).eq("is_test", true);
    await sb.from("team_match_notification_state").delete().eq("request_id", probeId);
    await sb.from("requests").delete().eq("id", probeId).eq("is_test", true);
  }
}

async function verifyScenario(sb: any, scenario: DemoScenario, state: any) {
  const now = new Date();
  const anchor: string = state.anchor_date;
  const personas: Record<string, string> = state.report?.personas ?? {};
  const assertions: Assertion[] = [];
  const push = (name: string, expected: string, verified: string) =>
    assertions.push({ name, expected, verified, pass: expected === verified });

  // 1. cast
  const { data: profiles } = await sb.from("profiles").select("id, display_name").eq("is_test", true);
  const present = new Set((profiles ?? []).map((p: any) => String(p.id)));
  const expectedKeys = [...scenario.teams.map((t) => t.key), ...scenario.freelancers.map((f) => f.key)];
  const missing = expectedKeys.filter((k) => !personas[k] || !present.has(personas[k]!));
  push("cast complete", `${expectedKeys.length} personas`, `${expectedKeys.length - missing.length} personas`);

  // 2. availability matrix
  for (const f of scenario.freelancers) {
    const expectedDays = resolveDays(anchor, f.availability, now);
    const { data: rows } = await sb
      .from("availability")
      .select("day")
      .eq("freelancer_id", personas[f.key])
      .eq("is_test", true);
    const got = (rows ?? []).map((r: any) => String(r.day)).sort();
    push(`availability ${f.key}`, expectedDays.join(","), got.join(","));
  }

  // 3. pool baseline
  const poolExpected = scenario.preSeeded.pool.members.length;
  const { count: poolCount } = await sb
    .from("team_pool")
    .select("*", { count: "exact", head: true })
    .eq("team_id", personas[scenario.preSeeded.pool.team])
    .eq("is_test", true);
  push("pool baseline", `${poolExpected} members`, `${poolCount ?? 0} members`);

  // 4. SOS eligibility, proven against the real product law
  const sosRequestId = state.report?.sosRequestId;
  const { data: sosReq } = await sb
    .from("requests")
    .select("id, status, is_active, duration, start_date")
    .eq("id", sosRequestId)
    .eq("is_test", true)
    .maybeSingle();
  const today = todayISO(now);
  const sosState = sosReq
    ? `${sosReq.status}/${sosReq.is_active ? "active" : "inactive"}/${sosReq.duration}/${sosReq.start_date === today ? "first-day-today" : "wrong-day"}`
    : "missing";
  push("SOS request state", "active/active/race_weekend/first-day-today", sosState);

  const { count: confirmed } = await sb
    .from("engagements")
    .select("*", { count: "exact", head: true })
    .eq("request_id", sosRequestId)
    .eq("status", "confirmed")
    .eq("is_test", true);
  push("SOS: no confirmed engagement", "0", String(confirmed ?? 0));

  const { count: noShow } = await sb
    .from("engagements")
    .select("*", { count: "exact", head: true })
    .eq("request_id", sosRequestId)
    .eq("status", "cancelled")
    .eq("cancellation_kind", "freelancer_late")
    .eq("is_test", true);
  push("SOS: late freelancer cancellation on record", "1", String(noShow ?? 0));

  const { data: sosTargets } = await sb
    .from("matches")
    .select("freelancer_id, skills_score, stale")
    .eq("request_id", sosRequestId)
    .eq("is_test", true)
    .gte("skills_score", 75);
  const standbyIds = scenario.preSeeded.sos.standby.map((k) => personas[k]);
  const standbyFound = (sosTargets ?? []).filter(
    (m: any) => !m.stale && standbyIds.includes(String(m.freelancer_id)),
  ).length;
  push("SOS standby ≥ 75% relevance", String(standbyIds.length), String(standbyFound));

  const { data: standbyAvail } = await sb
    .from("availability")
    .select("freelancer_id")
    .in("freelancer_id", standbyIds)
    .eq("day", today)
    .eq("is_test", true);
  push("SOS standby available today", String(standbyIds.length), String((standbyAvail ?? []).length));

  // 5. canonical Pit Calls, verified with the real engine on a transient probe
  const probes: Record<string, ProbeRow[]> = {};
  for (const pc of scenario.canonicalPitCalls) {
    const rows = await probePitCall(sb, scenario, pc, personas, anchor, now);
    probes[pc.key] = rows;
    const full = rows.filter((r) => !r.partial).map((r) => r.key);
    const partial = rows.filter((r) => r.partial).map((r) => r.key);

    if (pc.expected.full) {
      push(`${pc.key}: Full matches`, [...pc.expected.full].sort().join(","), [...full].sort().join(","));
    }
    if (pc.expected.partial) {
      push(`${pc.key}: Partial matches`, [...pc.expected.partial].sort().join(","), [...partial].sort().join(","));
    }
    if (pc.expected.absent) {
      const wronglyPresent = pc.expected.absent.filter((k) => rows.some((r) => r.key === k));
      push(`${pc.key}: absent personas`, "none present", wronglyPresent.length ? wronglyPresent.join(",") : "none present");
    }
    if (pc.expected.ranking) {
      const order = rows.map((r) => r.key).filter((k) => pc.expected.ranking!.includes(k));
      push(`${pc.key}: ranking`, pc.expected.ranking.join(" > "), order.join(" > "));
    }
    for (const [key, min] of Object.entries(pc.expected.min_score ?? {})) {
      const row = rows.find((r) => r.key === key);
      push(`${pc.key}: ${key} ≥ ${min}%`, "true", String(Boolean(row && row.skills_score >= min)));
    }
    for (const [key, max] of Object.entries(pc.expected.max_score ?? {})) {
      const row = rows.find((r) => r.key === key);
      push(`${pc.key}: ${key} ≤ ${max}%`, "true", String(Boolean(row && row.skills_score <= max)));
    }
    for (const key of pc.expected.visible_below_threshold ?? []) {
      const row = rows.find((r) => r.key === key);
      push(
        `${pc.key}: ${key} below 50% but visible`,
        "true",
        String(Boolean(row && row.skills_score < 50)),
      );
    }
  }

  const failures = assertions.filter((a) => !a.pass);
  return {
    status: failures.length ? "VERIFICATION FAILED" : "READY",
    assertions,
    failures: failures.length,
    probes,
    verified_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- server fns

export const listDemoScenarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const { data: states } = await sb.from("demo_seed_state").select("*");
    const stateById = new Map((states ?? []).map((s: any) => [String(s.scenario_id), s]));
    return DEMO_SCENARIO_LIST.map((s) => {
      const st: any = stateById.get(s.id);
      return {
        id: s.id,
        version: s.version,
        title: s.title,
        description: s.description,
        seeded: Boolean(st),
        anchor_date: st?.anchor_date ?? null,
        seeded_at: st?.seeded_at ?? null,
        status: st?.status ?? null,
        failures: st?.report?.verification?.failures ?? null,
      };
    });
  });

export const resetAndSeedDemoScenario = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ scenario_id: z.string(), confirm: z.literal("RESET TEST DATA") }).parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const scenario = getScenario(data.scenario_id);
    const sb = await admin();

    await validateTaxonomy(sb, scenario);

    const { data: liveBefore } = await sb.rpc("live_scope_snapshot");
    const purged = await purgeTestScope(sb);
    const seeded = await seedScenario(sb, scenario, context.userId);

    await sb.from("demo_seed_state").upsert(
      {
        scenario_id: scenario.id,
        version: scenario.version,
        anchor_date: seeded.anchor,
        seeded_at: new Date().toISOString(),
        seeded_by: context.userId,
        status: "unverified",
        report: {
          personas: seeded.personas,
          sosRequestId: seeded.sosRequestId,
          sosEngagementId: seeded.sosEngagementId,
          live_before: liveBefore,
        },
      },
      { onConflict: "scenario_id" },
    );

    const { data: state } = await sb
      .from("demo_seed_state")
      .select("*")
      .eq("scenario_id", scenario.id)
      .maybeSingle();
    const verification = await verifyScenario(sb, scenario, state);
    const { data: liveAfter } = await sb.rpc("live_scope_snapshot");
    const liveUnchanged = JSON.stringify(liveBefore) === JSON.stringify(liveAfter);

    await sb
      .from("demo_seed_state")
      .update({
        status: liveUnchanged ? verification.status : "VERIFICATION FAILED",
        report: { ...(state?.report ?? {}), verification, live_before: liveBefore, live_after: liveAfter, live_unchanged: liveUnchanged },
      })
      .eq("scenario_id", scenario.id);

    return {
      scenario_id: scenario.id,
      purged_accounts: purged,
      anchor: seeded.anchor,
      status: liveUnchanged ? verification.status : "VERIFICATION FAILED",
      failures: verification.failures,
      live_unchanged: liveUnchanged,
    };
  });

export const verifyDemoScenario = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ scenario_id: z.string() }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const scenario = getScenario(data.scenario_id);
    const sb = await admin();
    const { data: state } = await sb.from("demo_seed_state").select("*").eq("scenario_id", scenario.id).maybeSingle();
    if (!state) throw new Error("This scenario has not been seeded yet.");

    const { data: liveBefore } = await sb.rpc("live_scope_snapshot");
    const verification = await verifyScenario(sb, scenario, state);
    const { data: liveAfter } = await sb.rpc("live_scope_snapshot");
    const liveUnchanged = JSON.stringify(liveBefore) === JSON.stringify(liveAfter);

    await sb
      .from("demo_seed_state")
      .update({
        status: liveUnchanged ? verification.status : "VERIFICATION FAILED",
        report: { ...(state.report ?? {}), verification, live_unchanged: liveUnchanged },
      })
      .eq("scenario_id", scenario.id);

    return { status: verification.status, failures: verification.failures, assertions: verification.assertions, live_unchanged: liveUnchanged };
  });

/** Everything the printable Demo Guide needs: manifest + real resolved data. */
export const getDemoGuide = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ scenario_id: z.string() }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const scenario = getScenario(data.scenario_id);
    const sb = await admin();
    const now = new Date();

    const { data: state } = await sb.from("demo_seed_state").select("*").eq("scenario_id", scenario.id).maybeSingle();
    const personas: Record<string, string> = state?.report?.personas ?? {};
    const anchor: string = state?.anchor_date ?? computeAnchor(now);

    const { data: availabilityRows } = await sb
      .from("availability")
      .select("freelancer_id, day")
      .eq("is_test", true);
    const availByUser = new Map<string, string[]>();
    (availabilityRows ?? []).forEach((r: any) => {
      const list = availByUser.get(String(r.freelancer_id)) ?? [];
      list.push(String(r.day));
      availByUser.set(String(r.freelancer_id), list);
    });

    const { data: sosRequest } = state?.report?.sosRequestId
      ? await sb
          .from("requests")
          .select("id, title, start_date, status, is_active, duration")
          .eq("id", state.report.sosRequestId)
          .eq("is_test", true)
          .maybeSingle()
      : { data: null };

    const relevantDays = Array.from(
      new Set([
        ...scenario.canonicalPitCalls.flatMap((p) => resolveDays(anchor, p.input.days, now)),
        resolveDay(anchor, "today", now),
      ]),
    ).sort();

    return {
      scenario: {
        id: scenario.id,
        version: scenario.version,
        title: scenario.title,
        description: scenario.description,
      },
      status: state?.status ?? "not seeded",
      anchor,
      today: todayISO(now),
      seeded_at: state?.seeded_at ?? null,
      verification: state?.report?.verification ?? null,
      live_unchanged: state?.report?.live_unchanged ?? null,
      teams: scenario.teams.map((t) => ({
        key: t.key,
        user_id: personas[t.key] ?? null,
        name: t.team_name,
        city: `${t.city.city}, ${t.city.country}`,
        tokens: t.tokens,
        bio: t.bio,
        role_in_demo: t.role_in_demo,
        email: emailFor(scenario.id, t.key),
      })),
      freelancers: scenario.freelancers.map((f) => ({
        key: f.key,
        user_id: personas[f.key] ?? null,
        name: `${f.first_name} ${f.last_name}`,
        role_group: f.role_group,
        sub_roles: f.sub_roles,
        skills: f.skills,
        languages: f.languages,
        experiences: f.experiences,
        years_experience: f.years_experience,
        day_rate: f.day_rate,
        city: `${f.city.city}, ${f.city.country}`,
        headline: f.headline,
        role_in_demo: f.role_in_demo,
        pool_of: f.pool_of ?? [],
        email: emailFor(scenario.id, f.key),
        availability: personas[f.key] ? (availByUser.get(personas[f.key]!) ?? []).sort() : [],
      })),
      calendarDays: relevantDays,
      pitCalls: scenario.canonicalPitCalls.map((p) => ({
        key: p.key,
        title: p.title,
        narrative: p.narrative,
        team: scenario.teams.find((t) => t.key === p.team)?.team_name ?? p.team,
        steps: p.steps,
        expected: p.expected,
        input: {
          ...p.input,
          dates: resolveDays(anchor, p.input.days, now),
          location: `${p.input.location.city}, ${p.input.location.country}`,
        },
        probe: state?.report?.verification?.probes?.[p.key] ?? null,
      })),
      sos: {
        team: scenario.teams.find((t) => t.key === scenario.preSeeded.sos.team)?.team_name ?? scenario.preSeeded.sos.team,
        noShow: scenario.preSeeded.sos.noShowFreelancer,
        standby: scenario.preSeeded.sos.standby,
        steps: scenario.preSeeded.sos.steps,
        request: sosRequest ?? null,
      },
      pool: {
        team: scenario.teams.find((t) => t.key === scenario.preSeeded.pool.team)?.team_name ?? scenario.preSeeded.pool.team,
        members: scenario.preSeeded.pool.members,
        steps: scenario.preSeeded.pool.steps,
      },
      availabilityOpportunity: {
        ...scenario.availabilityOpportunity,
        dates: resolveDays(anchor, scenario.availabilityOpportunity.addDays, now),
        freelancerName: (() => {
          const f = scenario.freelancers.find((x) => x.key === scenario.availabilityOpportunity.freelancer);
          return f ? `${f.first_name} ${f.last_name}` : scenario.availabilityOpportunity.freelancer;
        })(),
      },
    };
  });

/**
 * Safe manual runners for a guided demo. TEST scope only, explicitly listed:
 * nothing that could silently change state while presenting (no anti-ghosting
 * auto-release, no purge, no e-mail or push dispatcher).
 */
const DEMO_JOBS = {
  recompute: { rpc: "recompute_matches_env", args: { _is_test: true } },
  pending_review: { rpc: "auto_activate_pending_reviews_env", args: { _is_test: true } },
  availability_queue: { rpc: "process_availability_recompute_queue_env", args: { _is_test: true } },
  availability_opportunity: { rpc: "run_availability_opportunity_test", args: {} },
  team_match_activity: { rpc: "run_team_match_notifications_test", args: {} },
  hot_partial: { rpc: "run_hot_partial_test", args: {} },
} as const;

export const runDemoJob = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ job: z.enum(["recompute", "pending_review", "availability_queue", "availability_opportunity", "team_match_activity", "hot_partial"]) }).parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const job = DEMO_JOBS[data.job];
    const { data: result, error } = await sb.rpc(job.rpc, job.args);
    if (error) throw new Error(error.message);
    return { job: data.job, result: (result as number) ?? 0 };
  });
