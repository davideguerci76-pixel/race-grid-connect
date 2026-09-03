import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidVat, normalizeVat } from "@/lib/vat";
import { FREELANCER_PROFILE_COLUMNS, TEAM_PROFILE_COLUMNS } from "@/lib/profile-columns";

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
      return { ok: true, skipped: [] as string[] };
    }
    // FROZEN GREEN: days snapshotted into a pending Request Confirmation cannot
    // be removed. The DB trigger is authoritative; here we simply skip them so
    // the rest of the selection still saves instead of aborting the statement.
    const { data: pending } = await supabase
      .from("engagements")
      .select("covered_days")
      .eq("freelancer_id", userId)
      .eq("status", "proposed");
    const frozen = new Set<string>();
    for (const row of ((pending ?? []) as Array<{ covered_days: string[] | null }>)) {
      for (const d of row.covered_days ?? []) frozen.add(String(d).slice(0, 10));
    }
    const skipped = data.dates.filter((d) => frozen.has(d));
    const removable = data.dates.filter((d) => !frozen.has(d));
    if (removable.length) {
      const { error } = await supabase.from("availability").delete().eq("freelancer_id", userId).in("day", removable);
      if (error) throw new Error(error.message);
    }
    return { ok: true, skipped };
  });

export const confirmMyCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("confirm_calendar" as any);
    if (error) throw new Error(error.message);
    return { calendar_last_confirmed_at: data as unknown as string };
  });

/**
 * Availability validity (not professional quality):
 * effective_freshness(day) = GREATEST(calendar_last_confirmed_at, availability.created_at)
 * FRESH -> used normally | NEEDS REVIEW -> still used, gentle reminder | UNCONFIRMED -> not used until reviewed
 */
export const getMyCalendarFreshness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: profile, error: pErr }, { data: settings }] = await Promise.all([
      supabase
        .from("freelancer_profiles")
        .select("calendar_last_confirmed_at, calendar_last_updated_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("platform_settings").select("key, value_num").eq("category", "calendar"),
    ]);
    if (pErr) throw new Error(pErr.message);

    const setting = (key: string, fallback: number) =>
      Number((settings ?? []).find((s: any) => s.key === key)?.value_num ?? fallback);
    const reviewDays = setting("availability_review_days", 45);
    const maxAgeDays = setting("availability_max_age_days", 90);

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const confirmedAt = (profile as any)?.calendar_last_confirmed_at ?? null;
    const confirmedMs = confirmedAt ? new Date(confirmedAt).getTime() : -Infinity;

    const { data: rows, error: aErr } = await supabase
      .from("availability")
      .select("day, created_at")
      .eq("freelancer_id", userId)
      .gte("day", today);
    if (aErr) throw new Error(aErr.message);

    const needsReviewDays: string[] = [];
    const unconfirmedDays: string[] = [];
    for (const r of (rows ?? []) as Array<{ day: string; created_at: string }>) {
      const eff = Math.max(confirmedMs, new Date(r.created_at).getTime());
      const ageDays = (now.getTime() - eff) / 86400000;
      if (ageDays >= maxAgeDays) unconfirmedDays.push(r.day);
      else if (ageDays >= reviewDays) needsReviewDays.push(r.day);
    }

    const state: "fresh" | "needs_review" | "unconfirmed" =
      unconfirmedDays.length > 0 ? "unconfirmed" : needsReviewDays.length > 0 ? "needs_review" : "fresh";

    return {
      calendar_last_confirmed_at: confirmedAt,
      calendar_last_updated_at: (profile as any)?.calendar_last_updated_at ?? null,
      review_days: reviewDays,
      max_age_days: maxAgeDays,
      state,
      future_days: (rows ?? []).length,
      needs_review_days: needsReviewDays,
      unconfirmed_days: unconfirmedDays,
    };
  });

export const getMyAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("availability").select("day").eq("freelancer_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.day);
  });

export const getMyBlockedDates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("engagements")
      .select("request_id, start_date, end_date, status, covered_days")
      .eq("freelancer_id", userId)
      .in("status", ["confirmed", "completed"]);
    if (error) throw new Error(error.message);

    const toIso = (d: Date) => {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const daysBetween = (start: string, end: string) => {
      const days: string[] = [];
      const cur = new Date(`${start.slice(0, 10)}T00:00:00.000Z`);
      const last = new Date(`${end.slice(0, 10)}T00:00:00.000Z`);
      while (!Number.isNaN(cur.getTime()) && !Number.isNaN(last.getTime()) && cur.getTime() <= last.getTime()) {
        days.push(toIso(cur));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      return days;
    };

    const engagements = (data ?? []) as Array<{
      request_id?: string | null;
      start_date: string;
      end_date: string;
      covered_days?: string[] | null;
    }>;
    const out = new Set<string>();
    const legacy: typeof engagements = [];

    // New confirmations carry the exact immutable snapshot.
    for (const e of engagements) {
      const covered = Array.isArray(e.covered_days) ? e.covered_days : null;
      if (covered && covered.length) {
        for (const d of covered) out.add(String(d).slice(0, 10));
      } else {
        legacy.push(e);
      }
    }

    // Legacy records with a request use the database SSOT. Only records without
    // request linkage fall back to their stored engagement range.
    if (legacy.length) {
      const requiredByEngagement = await Promise.all(
        legacy.map(async (engagement) => {
          if (engagement.request_id) {
            const { data: required, error: requiredError } = await (supabase.rpc as any)("request_required_days", {
              _request_id: engagement.request_id,
            });
            if (requiredError) throw new Error(requiredError.message);
            return ((required ?? []) as string[]).map((day) => String(day).slice(0, 10));
          }
          return daysBetween(engagement.start_date, engagement.end_date);
        }),
      );
      const allRequired = Array.from(new Set(requiredByEngagement.flat()));
      const available = new Set<string>();
      if (allRequired.length) {
        const { data: availableDays, error: availableError } = await supabase
          .from("availability")
          .select("day")
          .eq("freelancer_id", userId)
          .in("day", allRequired);
        if (availableError) throw new Error(availableError.message);
        for (const row of (availableDays ?? []) as Array<{ day: string }>) {
          available.add(String(row.day).slice(0, 10));
        }
      }
      legacy.forEach((engagement, index) => {
        const required = requiredByEngagement[index] ?? [];
        const worked = required.filter((day) => available.has(day));
        const daysToBlock = worked.length ? worked : daysBetween(engagement.start_date, engagement.end_date);
        daysToBlock.forEach((day) => out.add(day));
      });
    }
    return Array.from(out);
  });

/**
 * FROZEN GREEN days: availability snapshotted into a Request Confirmation that
 * is still pending. Still green (other teams can match them), but locked from
 * removal until the request is confirmed, declined, expired or withdrawn.
 */
export const getMyFrozenDates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("engagements")
      .select("covered_days")
      .eq("freelancer_id", context.userId)
      .eq("status", "proposed");
    if (error) throw new Error(error.message);
    const out = new Set<string>();
    for (const row of ((data ?? []) as Array<{ covered_days: string[] | null }>)) {
      for (const d of row.covered_days ?? []) out.add(String(d).slice(0, 10));
    }
    return Array.from(out);
  });

// ---- Profile saving ----
// Teams only: the profile "name" is the team name. Freelancers are identified
// exclusively by their locked legal name (first_name + last_name).
export const updateMyDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ display_name: z.string().trim().min(2).max(80) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: me } = await context.supabase
      .from("profiles")
      .select("user_type")
      .eq("id", context.userId)
      .maybeSingle();
    if ((me as any)?.user_type === "freelancer") throw new Error("NAME_LOCKED");
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
        role_group: z.string().min(1).max(64),
        sub_roles: z
          .array(
            z.object({
              sub_role: z.string().min(1).max(64),
              level: z.enum(["junior", "intermediate", "senior"]),
            }),
          )
          .max(40)
          .optional(),
        headline: z.string().max(140).optional().nullable(),
        disciplines: z.array(disciplineEnum).max(80),
        skills: z.array(z.string().max(64)).max(80).optional(),
        education: z.string().max(64).optional().nullable(),
        day_rate: z.number().int().min(0).optional().nullable(),
        location: z.string().max(140).optional().nullable(),
        location_lat: z.number().finite().min(-90).max(90).optional().nullable(),
        location_lng: z.number().finite().min(-180).max(180).optional().nullable(),
        location_city: z.string().max(120).optional().nullable(),
        location_region: z.string().max(120).optional().nullable(),
        location_country: z.string().max(120).optional().nullable(),
        location_place_id: z.string().max(255).optional().nullable(),
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

    // Sensitive columns (day_rate, location_lat/lng) are NOT writable through the
    // Data API upsert: SELECT is revoked on them for `authenticated`, and an
    // ON CONFLICT DO UPDATE requires SELECT on every referenced column.
    // They are persisted owner-scoped via the `set_my_rate_location` RPC below.
    const { data: row, error } = await context.supabase.from("freelancer_profiles").upsert(
      {
        user_id: context.userId,
        role_group: data.role_group,
        sub_roles: data.sub_roles ?? [],
        headline: data.headline || null,
        disciplines: data.disciplines,
        skills: data.skills ?? [],
        education: data.education || null,
        location: data.location || null,
        location_city: data.location_city ?? null,
        location_region: data.location_region ?? null,
        location_country: data.location_country ?? null,
        location_place_id: data.location_place_id ?? null,
        bio: data.bio || null,
        travels: data.travels,
        experiences: data.experiences ?? [],
        languages: data.languages ?? [],
      } as never,
      { onConflict: "user_id" },
    ).select(FREELANCER_PROFILE_COLUMNS).single();
    if (error) throw new Error(error.message);

    const { error: sensitiveError } = await (context.supabase.rpc as any)("set_my_rate_location", {
      _day_rate: data.day_rate ?? null,
      _location_lat: data.location_lat ?? null,
      _location_lng: data.location_lng ?? null,
    });
    if (sensitiveError) throw new Error(sensitiveError.message);

    // Recompute only after every profile write has succeeded. This intentionally
    // bypasses the calendar debounce queue and performs one logical freelancer-wide recompute.
    const { error: recomputeError } = await (context.supabase.rpc as any)(
      "recompute_my_matches_after_profile_save",
    );
    if (recomputeError) throw new Error(recomputeError.message);

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
        vat_number: z
          .string()
          .trim()
          .min(5)
          .max(24)
          .refine((v) => isValidVat(v), "INVALID_VAT"),
        team_type: z.string().max(120).optional().nullable(),
        location: z.string().max(140).optional().nullable(),
        location_lat: z.number().finite().min(-90).max(90).optional().nullable(),
        location_lng: z.number().finite().min(-180).max(180).optional().nullable(),
        location_city: z.string().max(120).optional().nullable(),
        location_region: z.string().max(120).optional().nullable(),
        location_country: z.string().max(120).optional().nullable(),
        location_place_id: z.string().max(255).optional().nullable(),
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
        vat_number: normalizeVat(data.vat_number),
        initials,
        team_type: data.team_type || null,
        location: data.location || null,
        location_lat: data.location_lat ?? null,
        location_lng: data.location_lng ?? null,
        location_city: data.location_city ?? null,
        location_region: data.location_region ?? null,
        location_country: data.location_country ?? null,
        location_place_id: data.location_place_id ?? null,
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
        role_group: z.string().min(1).max(64),
        sub_role: z.string().max(64).optional().nullable(),
        sub_role_min_level: z.enum(["junior", "intermediate", "senior"]).optional().default("junior"),
        sub_role_hard: z.boolean().optional().default(false),
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
        repost_of: z.string().uuid().optional().nullable(),
        location_lat: z.number().finite().min(-90).max(90).optional().nullable(),
        location_lng: z.number().finite().min(-180).max(180).optional().nullable(),
        location_city: z.string().max(120).optional().nullable(),
        location_region: z.string().max(120).optional().nullable(),
        location_country: z.string().max(120).optional().nullable(),
        location_place_id: z.string().max(255).optional().nullable(),
        location_relevance: z.enum(["not_relevant","relevant","mandatory"]).optional().default("not_relevant"),
        location_anchor: z.enum(["this","team"]).optional().default("this"),
        location_radius_km: z.number().int().min(1).max(20000).optional().nullable(),
        search_mode: z.enum(["standard", "pool"]).optional().default("standard"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const payload: Record<string, unknown> = {
      title: data.title,
      role_group: data.role_group,
      sub_role: data.sub_role || null,
      sub_role_min_level: data.sub_role_min_level ?? "junior",
      sub_role_hard: data.sub_role_hard ?? false,
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
      travel_required: data.travel_required ?? true,
      repost_of: data.repost_of ?? null,
      location_lat: data.location_lat ?? null,
      location_lng: data.location_lng ?? null,
      location_city: data.location_city ?? null,
      location_region: data.location_region ?? null,
      location_country: data.location_country ?? null,
      location_place_id: data.location_place_id ?? null,
      location_relevance: data.location_relevance ?? "not_relevant",
      location_anchor: data.location_anchor ?? "this",
      location_radius_km: data.location_radius_km ?? null,
      search_mode: data.search_mode ?? "standard",
    };
    const { data: flag } = await context.supabase
      .from("platform_settings")
      .select("value_num")
      .eq("key", "flag_pitcall_creation_disabled")
      .maybeSingle();
    if (flag && Number(flag.value_num) > 0) {
      throw new Error("Pit Call creation is temporarily disabled by the platform administrator.");
    }
    const { data: row, error } = await context.supabase.rpc("create_request", { _payload: payload as never });
    if (error) throw new Error(error.message);
    return row;
  });

/** Post-review MODIFY: server decides what counts as a meaningful change. */
export const modifyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        request_id: z.string().uuid(),
        patch: z.record(z.string(), z.unknown()),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase.rpc as any)("modify_request", {
      _request_id: data.request_id,
      _payload: data.patch,
    });
    if (error) throw new Error(error.message);
    return row;
  });

/** RED cancel during the review window: 100% token return when eligible. */
export const redCancelRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { request_id: string }) => z.object({ request_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase.rpc as any)("red_cancel_request", {
      _request_id: data.request_id,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { refund_tokens: Number(row?.refund_tokens ?? 0), balance: Number(row?.balance ?? 0) };
  });

/** End the post-review window early and publish the Pit Call. */
export const activateRequestNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { request_id: string }) => z.object({ request_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase.rpc as any)("activate_request_now", {
      _request_id: data.request_id,
    });
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
    let outsideCounts: Record<string, number> = {};
    let confirmedMap: Record<string, string> = {};
    if (ids.length) {
      // Outside-pool matches are hidden from the team by RLS. Counts stay aggregate-only and
      // are computed server-side over pit calls this team provably owns.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [{ data: matches }, { data: engs }, { data: poolRows }] = await Promise.all([
        supabaseAdmin.from("matches").select("request_id, freelancer_id").eq("stale", false).in("request_id", ids),
        supabase
          .from("engagements")
          .select("id, request_id, status")
          .in("request_id", ids)
          .eq("status", "confirmed"),
        supabase.from("team_pool").select("freelancer_id").eq("team_id", userId),
      ]);
      const poolSet = new Set(((poolRows ?? []) as any[]).map((p) => p.freelancer_id));
      const modeById = new Map((data ?? []).map((r: any) => [r.id, r.search_mode]));
      for (const m of ((matches ?? []) as any[])) {
        const rid = m.request_id as string;
        const isPool = modeById.get(rid) === "pool";
        if (isPool && !poolSet.has(m.freelancer_id)) {
          outsideCounts[rid] = (outsideCounts[rid] ?? 0) + 1;
        } else {
          counts[rid] = (counts[rid] ?? 0) + 1;
        }
      }
      confirmedMap = (engs ?? []).reduce<Record<string, string>>((acc, e: any) => {
        if (e.request_id) acc[e.request_id] = e.id;
        return acc;
      }, {});
    }
    return (data ?? []).map((r) => ({
      ...r,
      matches_count: counts[r.id] ?? 0,
      outside_pool_count: outsideCounts[r.id] ?? 0,
      confirmed_engagement_id: confirmedMap[r.id] ?? null,
    }));


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
      .eq("stale", false)
      .eq(col, userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // A Pit Call inside its post-review window is invisible to Freelancers:
    // the Team can still change its mind before the request goes live.
    const rawMatches = ((matches ?? []) as any[]).filter(
      (m) => !(isFreelancer && m.request?.status === "pending_review"),
    );
    const otherIds = Array.from(new Set(rawMatches.map((m) => (isFreelancer ? m.team_id : m.freelancer_id))));

    const teamProfilesById = new Map<string, any>();
    const freelancerProfilesById = new Map<string, any>();
    const emailsById = new Map<string, string | null>();
    if (otherIds.length) {
      if (isFreelancer) {
        const { data: tps } = await supabase.from("team_profiles").select(TEAM_PROFILE_COLUMNS).in("user_id", otherIds);
        (tps ?? []).forEach((p: any) => teamProfilesById.set(p.user_id, p));
      } else {
        const { data: fps } = await supabase.from("freelancer_profiles").select(FREELANCER_PROFILE_COLUMNS).in("user_id", otherIds);
        // Rate columns are not Data-API readable; the caller is a party to these
        // matches, so read them server-side and keep the existing gating.
        const { fetchRatesByIds } = await import("@/lib/rates.server");
        const rateMap = await fetchRatesByIds(otherIds);
        (fps ?? []).forEach((p: any) => freelancerProfilesById.set(p.user_id, { ...p, ...(rateMap.get(p.user_id) ?? { day_rate: null, currency: null }) }));
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
    const pendingInfoByMatchId = new Map<string, { id: string; expires_at: string | null; extension_count: number }>();
    const confirmedMatchIds = new Set<string>();
    const takenRequestIds = new Set<string>();
    if (matchIds.length) {
      const { data: eng } = await supabase
        .from("engagements")
        .select("id, match_id, request_id, status, proposed_by, freelancer_id, team_id, expires_at, extension_count")
        .in("match_id", matchIds);
      (eng ?? []).forEach((e: any) => {
        if (e.status === "proposed" && e.proposed_by !== userId && e.match_id) {
          pendingByMatchId.set(e.match_id, e.id);
          pendingInfoByMatchId.set(e.match_id, {
            id: e.id,
            expires_at: e.expires_at ?? null,
            extension_count: Number(e.extension_count ?? 0),
          });
        }
        if (e.status === "confirmed" && e.match_id) confirmedMatchIds.add(e.match_id);
      });
      // Requests already filled by someone else (freelancer view of race-lost matches)
      const reqIds = Array.from(new Set(rawMatches.map((m: any) => m.request?.id).filter(Boolean)));
      if (reqIds.length && isFreelancer) {
        const { data: filledReqs } = await supabase
          .from("engagements")
          .select("request_id, freelancer_id, status")
          .in("request_id", reqIds)
          .eq("status", "confirmed");
        (filledReqs ?? []).forEach((r: any) => {
          if (r.freelancer_id !== userId && r.request_id) takenRequestIds.add(r.request_id);
        });
      }
    }

    // Legal names + phone of the counterparty are only fetched for CONFIRMED matches.
    const legalNameById = new Map<string, string | null>();
    const phoneById = new Map<string, { phone_dial_code: string | null; phone_number: string | null }>();
    const confirmedOtherIds = Array.from(new Set(
      rawMatches.filter((m: any) => confirmedMatchIds.has(m.id)).map((m: any) => (isFreelancer ? m.team_id : m.freelancer_id)),
    ));
    if (confirmedOtherIds.length) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ps } = await supabaseAdmin
          .from("profiles")
          .select("id, display_name, first_name, last_name, user_type")
          .in("id", confirmedOtherIds);
        for (const p of (ps ?? []) as any[]) {
          const legal = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
          legalNameById.set(p.id, p.user_type === "freelancer" ? (legal || null) : p.display_name);
        }
        if (!isFreelancer) {
          const { data: cs } = await supabaseAdmin
            .from("freelancer_contacts")
            .select("user_id, phone_dial_code, phone_number")
            .in("user_id", confirmedOtherIds);
          for (const c of (cs ?? []) as any[]) {
            phoneById.set(c.user_id, { phone_dial_code: c.phone_dial_code, phone_number: c.phone_number });
          }
        }
      } catch { /* ignore */ }
    }

    // ---- Reveal payload (freelancer side) ----
    // A single 1-token reveal unlocks every anonymous detail of the Pit Call.
    // The team identity (name, logo, contacts) stays hidden until confirmation.
    let myDayRate: number | null = null;
    const candidateStats = new Map<string, { total: number; rank: number }>();
    if (isFreelancer) {
      const { data: myRate } = await (supabase.rpc as any)("my_day_rate");
      myDayRate = (Array.isArray(myRate) ? (myRate[0] as any)?.day_rate : null) ?? null;
      const revealedReqIds = Array.from(new Set(
        rawMatches.filter((m: any) => m.revealed_by_freelancer).map((m: any) => m.request?.id).filter(Boolean),
      ));
      if (revealedReqIds.length) {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: peers } = await supabaseAdmin
            .from("matches")
            .select("request_id, freelancer_id, match_score")
            .eq("stale", false)
            .in("request_id", revealedReqIds as string[]);
          const byReq = new Map<string, any[]>();
          for (const p of (peers ?? []) as any[]) {
            const list = byReq.get(p.request_id) ?? [];
            list.push(p);
            byReq.set(p.request_id, list);
          }
          for (const [reqId, list] of byReq) {
            const sorted = list.slice().sort((a, b) => Number(b.match_score ?? 0) - Number(a.match_score ?? 0));
            const idx = sorted.findIndex((p) => p.freelancer_id === userId);
            if (idx >= 0) candidateStats.set(reqId, { total: sorted.length, rank: idx + 1 });
          }
        } catch { /* anonymous ranking is best-effort */ }
      }
    }

    const buildRequestDetail = (r: any) => {
      if (!r) return null;
      const stats = r.id ? candidateStats.get(r.id) ?? null : null;
      const langs = Array.isArray(r.languages) ? r.languages : [];
      const exp = Array.isArray(r.experience_requirements) ? r.experience_requirements : [];
      return {
        logistics: {
          travel_required: r.travel_required ?? null,
          location: r.location ?? null,
          location_city: r.location_city ?? null,
          location_region: r.location_region ?? null,
          location_country: r.location_country ?? null,
          location_radius_km: r.location_radius_km ?? null,
          location_anchor: r.location_anchor ?? null,
          circuit: r.circuit ?? null,
          duration: r.duration ?? null,
          start_date: r.start_date ?? null,
          end_date: r.end_date ?? null,
          season_dates: Array.isArray(r.season_dates) ? r.season_dates : null,
        },
        requirements: {
          role_hard: r.role_hard ?? null,
          sub_role_hard: r.sub_role_hard ?? null,
          sub_role_min_level: r.sub_role_min_level ?? null,
          skills_hard: Array.isArray(r.skills_hard) ? r.skills_hard : [],
          skills: Array.isArray(r.skills) ? r.skills : [],
          education: Array.isArray(r.education) ? r.education : [],
          languages: langs,
          experience_requirements: exp,
          notes: r.notes ?? null,
        },
        economics: {
          budget_min: r.budget_min ?? null,
          budget_max: r.budget_max ?? null,
          budget_unit: r.budget_unit ?? null,
          currency: r.currency ?? null,
          my_day_rate: myDayRate,
          // Only meaningful when the Pit Call budget is expressed per day.
          rate_fit:
            myDayRate != null && r.budget_unit === "day" && (r.budget_min != null || r.budget_max != null)
              ? (r.budget_max != null && myDayRate > Number(r.budget_max)
                  ? "above"
                  : r.budget_min != null && myDayRate < Number(r.budget_min)
                    ? "below"
                    : "inside")
              : null,
        },
        candidates: stats,
      };
    };

    // Fields of the Pit Call visible before paying the reveal.
    const publicRequestFields = [
      "id", "title", "role", "role_group", "sub_role", "discipline", "start_date", "end_date",
      "duration", "status", "is_active", "created_at", "search_mode", "team_id",
    ];

    const redacted = rawMatches.map((m: any) => {


      const revealedByMe = isFreelancer ? m.revealed_by_freelancer : m.revealed_by_team;
      const isConfirmed = confirmedMatchIds.has(m.id);
      // Names/contacts stay hidden until a confirmed engagement links the two parties.
      // Token unlock only reveals technical info.
      let counterparty: any = null;
      if (revealedByMe) {
        if (isFreelancer) {
          const tp = teamProfilesById.get(m.team_id);
          counterparty = tp ? {
            // team_name is intentionally hidden until confirmed
            team_name: isConfirmed ? tp.team_name : null,
            team_type: tp.team_type,
            location: tp.location,
            // website/contact_email withheld — freelancer only ever sees team name post-confirmation
            website: null,
            bio: tp.bio,
            primary_discipline: tp.primary_discipline,
            initials: isConfirmed ? tp.initials : null,
            contact_email: null,
          } : null;
        } else {
          const fp = freelancerProfilesById.get(m.freelancer_id);
          const ph = isConfirmed ? phoneById.get(m.freelancer_id) : null;
          counterparty = fp ? {
            headline: fp.headline,
            role_group: fp.role_group,
            sub_roles: fp.sub_roles,
            disciplines: fp.disciplines,
            skills: fp.skills,
            location: fp.location,
            day_rate: fp.day_rate,
            bio: fp.bio,
            travels: fp.travels,
            // Legal name + contacts only after a confirmed match
            legal_name: isConfirmed ? (legalNameById.get(m.freelancer_id) ?? null) : null,
            contact_email: isConfirmed ? (emailsById.get(m.freelancer_id) ?? null) : null,
            phone_dial_code: ph?.phone_dial_code ?? null,
            phone_number: ph?.phone_number ?? null,
          } : null;
        }
      }
      // Names in the joined profile rows: hidden until confirmed, legal name after.
      if (!isConfirmed) {
        if (m.team) m.team = { display_name: "Hidden Team", avatar_url: null };
        if (m.freelancer) m.freelancer = { display_name: "Hidden Specialist", avatar_url: null };
      } else {
        const otherId = isFreelancer ? m.team_id : m.freelancer_id;
        const nm = legalNameById.get(otherId) ?? null;
        if (isFreelancer) {
          if (m.team) m.team = { ...m.team, display_name: nm ?? m.team.display_name };
        } else if (m.freelancer) {
          m.freelancer = { ...m.freelancer, display_name: nm ?? m.freelancer.display_name };
        }
      }

      // Freelancers only receive the full Pit Call payload once the reveal is paid.
      let requestDetail: any = null;
      if (isFreelancer && m.request) {
        if (revealedByMe) {
          requestDetail = buildRequestDetail(m.request);
        } else {
          const slim: any = {};
          for (const k of publicRequestFields) slim[k] = m.request[k];
          m.request = slim;
        }
      }

      return {
        ...m,
        revealedByMe,
        requestDetail,
        counterparty,

        isConfirmed,
        matchTaken: !isConfirmed && (m.request?.id ? takenRequestIds.has(m.request.id) : false),
        pending_engagement_id: pendingByMatchId.get(m.id) ?? null,
        pending_engagement: pendingInfoByMatchId.get(m.id) ?? null,
      };
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

/** Team-side: pull back a still-pending Request Confirmation (releases Frozen Green days). */
export const withdrawMatchConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("withdraw_match_confirmation" as any, { _engagement_id: data.id });
    if (error) throw new Error(error.message);
    return row;
  });

export const declineMatchConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("decline_match_confirmation" as any, { _engagement_id: data.id });
    if (error) throw new Error(error.message);
    return row;
  });

export const extendMatchConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("extend_match_confirmation" as any, { _engagement_id: data.id });
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
      .select("*, request:requests(id, title, role_group, sub_role, sub_role_min_level, discipline, start_date, end_date, season_dates, skills, skills_hard, education, languages, budget_min, budget_max, budget_unit, notes, location, circuit, duration), match:matches(id, match_score, is_perfect, overlap_days, missing_criteria, revealed_by_freelancer, revealed_by_team)")
      .or(`freelancer_id.eq.${userId},team_id.eq.${userId}`)
      .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const teamIds = Array.from(new Set(rows.map((r) => r.team_id)));
    const freelancerIds = Array.from(new Set(rows.map((r) => r.freelancer_id)));
    const allIds = Array.from(new Set([...teamIds, ...freelancerIds]));
    const [tpsRes, fpsRes] = await Promise.all([
      teamIds.length
        ? supabase.from("team_profiles").select("user_id, team_name, team_type, location, website, bio, primary_discipline").in("user_id", teamIds)
        : Promise.resolve({ data: [] as any[] } as any),
      freelancerIds.length
        ? supabase.from("freelancer_profiles").select("user_id, headline, role_group, sub_roles, location, disciplines, skills, bio, travels").in("user_id", freelancerIds)
        : Promise.resolve({ data: [] as any[] } as any),
    ]);
    const tpMap = new Map(((tpsRes.data ?? []) as any[]).map((r: any) => [r.user_id, r]));
    const fpMap = new Map(((fpsRes.data ?? []) as any[]).map((r: any) => [r.user_id, r]));
    // Engagement parties may see the rate: rows above are already scoped to the caller.
    {
      const { fetchRatesByIds } = await import("@/lib/rates.server");
      const rateMap = await fetchRatesByIds(freelancerIds);
      for (const [id, fp] of fpMap) Object.assign(fp as any, rateMap.get(id as string) ?? {});
    }

    // RLS on `profiles` restricts to auth.uid()=id, so counterparties' display_name
    // isn't visible via a nested join. Fetch it via admin (the .or above already
    // scoped rows to engagements the caller is party to).
    const nameMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
    const contactsMap = new Map<string, { email: string | null; phone_dial_code: string | null; phone_number: string | null }>();
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (allIds.length) {
        const { data: ps } = await supabaseAdmin.from("profiles").select("id, display_name, first_name, last_name, user_type, avatar_url").in("id", allIds);
        for (const p of (ps ?? []) as any[]) {
          // Freelancers are identified by their locked legal name only.
          const legal = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
          const name = p.user_type === "freelancer" ? (legal || null) : p.display_name;
          nameMap.set(p.id, { display_name: name, avatar_url: p.avatar_url });
        }
      }
      // For confirmed/completed engagements only, surface freelancer contact to team viewer
      const confirmedFids = Array.from(new Set(rows.filter((r) => (r.status === "confirmed" || r.status === "completed") && r.team_id === userId).map((r) => r.freelancer_id)));
      if (confirmedFids.length) {
        const { data: cs } = await supabaseAdmin.from("freelancer_contacts").select("user_id, phone_dial_code, phone_number").in("user_id", confirmedFids);
        for (const c of (cs ?? []) as any[]) contactsMap.set(c.user_id, { email: null, phone_dial_code: c.phone_dial_code, phone_number: c.phone_number });
        for (const fid of confirmedFids) {
          const cur = contactsMap.get(fid) ?? { email: null, phone_dial_code: null, phone_number: null };
          try {
            const { data: u } = await supabaseAdmin.auth.admin.getUserById(fid);
            cur.email = u?.user?.email ?? null;
          } catch { /* ignore */ }
          contactsMap.set(fid, cur);
        }
      }
    } catch { /* ignore admin errors */ }

    // Which freelancers the viewing team already keeps in its pool (manual add CTA state).
    const poolIds = new Set<string>();
    if (rows.some((r) => r.team_id === userId)) {
      const { data: poolRows } = await supabase.from("team_pool").select("freelancer_id").eq("team_id", userId);
      for (const p of (poolRows ?? []) as any[]) poolIds.add(p.freelancer_id);
    }

    return rows.map((r) => {
      const fName = nameMap.get(r.freelancer_id);
      const tName = nameMap.get(r.team_id);
      const contact = contactsMap.get(r.freelancer_id) ?? null;
      // The freelancer's legal name is only disclosed to the team once the match is confirmed.
      const engagementSealed = r.status === "confirmed" || r.status === "completed";
      const disclosed = engagementSealed || r.freelancer_id === userId;
      // Team identity stays anonymous for the freelancer until the engagement is
      // confirmed: a "Request confirmation" (status = proposed) must never leak it.
      const teamDisclosed = engagementSealed || r.team_id === userId;
      const rawTp = tpMap.get(r.team_id) ?? null;
      const teamProfile = rawTp
        ? teamDisclosed
          ? rawTp
          : {
              user_id: null,
              team_name: null,
              website: null,
              bio: null,
              team_type: rawTp.team_type ?? null,
              location: rawTp.location ?? null,
              primary_discipline: rawTp.primary_discipline ?? null,
            }
        : null;
      // Reveal state of the underlying match, from the caller's point of view.
      // The 1-token reveal is independent from the team identity disclosure.
      const revealedByMe = r.freelancer_id === userId
        ? !!r.match?.revealed_by_freelancer
        : !!r.match?.revealed_by_team;
      return {
        ...r,
        in_pool: r.team_id === userId ? poolIds.has(r.freelancer_id) : false,
        revealedByMe,
        freelancer: {
          display_name: disclosed ? (fName?.display_name ?? null) : null,
          avatar_url: disclosed ? (fName?.avatar_url ?? null) : null,
        },
        team: {
          display_name: teamDisclosed ? (tName?.display_name ?? null) : null,
          avatar_url: teamDisclosed ? (tName?.avatar_url ?? null) : null,
        },
        team_profile: teamProfile,
        freelancer_profile: fpMap.get(r.freelancer_id) ?? null,
        freelancer_contact: contact,
      };
    });


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
    const { userId } = context;
    // Token balances are never writable from the client: go through the
    // trusted server-side crediting path only.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: nextBalance, error } = await supabaseAdmin.rpc("credit_tokens", {
      _user_id: userId,
      _delta: amount,
      _reason: "purchase",
      _note: `Demo pack: ${data.pack}`,
    } as never);
    if (error) throw new Error(error.message);
    return { balance: (nextBalance as number | null) ?? 0, added: amount };
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

// ---- Team match view per request (tiered pagination v3) ----
export const getRequestMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { request_id: string }) =>
    z.object({ request_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // If the post-review window has elapsed, the request goes live before we read it.
    try {
      await (supabase.rpc as any)("activate_request_if_due", { _request_id: data.request_id });
    } catch {
      // Non-fatal: the scheduled activation still covers this request.
    }

    const { data: req, error: reqErr } = await supabase
      .from("requests")
      .select("*")
      .eq("id", data.request_id)
      .maybeSingle();
    if (reqErr) throw new Error(reqErr.message);
    if (!req) throw new Error("Request not found");
    if (req.team_id !== userId) throw new Error("Not owner of this request");
    const isPoolRequest = (req as any).search_mode === "pool";
    const inReview = (req as any).status === "pending_review";

    // Post-review window: band-only payload. No raw match counts, tiers or profiles
    // leave the server while the Pit Call is still in preview.
    if (inReview) {
      return {
        request: req,
        in_review: true,
        review_deadline_at: (req as any).review_deadline_at ?? null,
        match_potential: (((req as any).match_potential_current ?? (req as any).initial_match_potential) ?? null) as
          | "strong"
          | "targeted"
          | "red"
          | null,
        // Anti-probing: only limits and eligibility leave the server, never counts.
        modify_state: await (async () => {
          const [{ data: budgetLeft }, settingsRows] = await Promise.all([
            (supabase.rpc as any)("team_recheck_budget_left", { _team_id: userId }),
            supabase.from("platform_settings").select("key, value_num").in("key", ["max_modify_per_pitcall"]),
          ]);
          const maxModify = Number(
            (settingsRows.data ?? []).find((s: any) => s.key === "max_modify_per_pitcall")?.value_num ?? 3,
          );
          const modifyCount = Number((req as any).modify_count ?? 0);
          const currentBand = ((req as any).match_potential_current ?? (req as any).initial_match_potential) ?? null;
          return {
            modify_count: modifyCount,
            max_modify: maxModify,
            budget_left: Number(budgetLeft ?? 0),
            can_modify: modifyCount < maxModify && Number(budgetLeft ?? 0) > 0,
            red_cancel_eligible: currentBand === "red" && !(req as any).red_cancelled_at && !(req as any).refund_kind,
          };
        })(),
        confirmable_left: 0,

        items: [] as any[],
        items_partial: [] as any[],
        hired: null as any,
        tiers: [] as any[],
        tiers_partial: [] as any[],
        per_profile_cost: 0,
        total_matches: 0,
        total_partial_matches: 0,
        outside_pool_count: 0,
        upgrade_cost: 0,
        hard_cap: 0,
        partial_banner: null as any,
        refund_quote: {
          spent: 0,
          refund_pct: 0,
          refund_full: 0,
          refund_partial: 0,
          low_relevance_eligible: false,
          low_relevance_refund: 0,
        },
      };
    }

    if (!inReview) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.rpc("recompute_matches", { _freelancer_id: null, _request_id: data.request_id } as never);
      } catch {
        // Keep the page resilient if a live recompute is temporarily unavailable; existing matches still render below.
      }
    }


    const settingKeys = [
      "cost_tier2_entry",
      "cost_tier3_entry",
      "cost_unlock_match_for_team",
      "tier2_size",
      "tier3_size",
      "hard_cap_matches",
      "cost_request_race_weekend",
      "cost_request_full_season",
      "cost_pool_search",
    ];
    const { data: settingsRows } = await supabase
      .from("platform_settings")
      .select("key, value_num")
      .in("key", settingKeys);
    const settings = new Map((settingsRows ?? []).map((r: any) => [r.key, Number(r.value_num)]));
    const tier2Base = settings.get("cost_tier2_entry") ?? 5;
    const tier3Base = settings.get("cost_tier3_entry") ?? 25;
    const perProfileCost = settings.get("cost_unlock_match_for_team") ?? 1;
    const tier2Size = settings.get("tier2_size") ?? 10;
    const tier3Size = settings.get("tier3_size") ?? 30;
    const hardCap = settings.get("hard_cap_matches") ?? 50;

    const { data: allMatches, error: mErr } = await supabase
      .from("matches")
      .select("*")
      .eq("stale", false)
      .eq("request_id", data.request_id);
    if (mErr) throw new Error(mErr.message);

    const { data: poolRows } = await supabase.from("team_pool").select("freelancer_id").eq("team_id", userId);
    const poolSet = new Set((poolRows ?? []).map((r: any) => r.freelancer_id));
    // RLS already hides outside-pool matches from the team on pool pit calls; the filter is kept
    // as defence in depth.
    const requestMatches = isPoolRequest
      ? (allMatches ?? []).filter((m: any) => poolSet.has(m.freelancer_id))
      : (allMatches ?? []);
    let outsidePoolCount = 0;
    if (isPoolRequest) {
      // Aggregate-only: no id, score or profile of an outside-pool freelancer leaves the server.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: outsideRows } = await supabaseAdmin
        .from("matches")
        .select("freelancer_id")
        .eq("stale", false)
        .eq("request_id", data.request_id);
      outsidePoolCount = ((outsideRows ?? []) as any[]).filter((m) => !poolSet.has(m.freelancer_id)).length;
    }


    // Sort by final_score DESC (penalty applied), tiebreak by created_at
    const sortFn = (a: any, b: any) => {
      const ds = Number(b.final_score ?? b.match_score ?? 0) - Number(a.final_score ?? a.match_score ?? 0);
      if (ds !== 0) return ds;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    };
    const allFull = requestMatches.filter((m: any) => !m.is_partial).slice().sort(sortFn).slice(0, hardCap);
    const allPartial = requestMatches.filter((m: any) => m.is_partial).slice().sort(sortFn).slice(0, hardCap);

    const computeTierCost = (base: number, slots: number, size: number) => {
      if (slots <= 0) return 0;
      if (slots >= size) return Math.round(base);
      return Math.max(1, Math.round((base * slots) / size));
    };
    const tiersFor = (total: number, unlockedSet: Set<number>) => {
      const t1 = Math.min(total, 10);
      const t2Slots = Math.max(0, Math.min(total, 10 + tier2Size) - 10);
      const t3Slots = Math.max(0, Math.min(total, 10 + tier2Size + tier3Size) - (10 + tier2Size));
      return [
        { tier: 1, size: 10, real_count: t1, entry_cost: 0, entry_cost_full: 0, unlocked: true, proportional: false },
        {
          tier: 2, size: tier2Size, real_count: t2Slots,
          entry_cost: computeTierCost(tier2Base, t2Slots, tier2Size),
          entry_cost_full: Math.round(tier2Base),
          unlocked: unlockedSet.has(2),
          proportional: t2Slots > 0 && t2Slots < tier2Size,
        },
        {
          tier: 3, size: tier3Size, real_count: t3Slots,
          entry_cost: computeTierCost(tier3Base, t3Slots, tier3Size),
          entry_cost_full: Math.round(tier3Base),
          unlocked: unlockedSet.has(3),
          proportional: t3Slots > 0 && t3Slots < tier3Size,
        },
      ];
    };

    const { data: tierUnlocks } = await supabase
      .from("request_tier_unlocks" as any)
      .select("tier, scope, tokens_spent")
      .eq("team_id", userId)
      .eq("request_id", data.request_id);
    const unlockedFull = new Set<number>();
    const unlockedPartial = new Set<number>();
    for (const r of (tierUnlocks ?? []) as any[]) {
      const scope = (r.scope ?? "full") as string;
      (scope === "partial" ? unlockedPartial : unlockedFull).add(Number(r.tier));
    }
    const poolUnlockedTiers = new Set([2, 3]);
    const tiersFull = tiersFor(allFull.length, isPoolRequest ? poolUnlockedTiers : unlockedFull);
    const tiersPartial = tiersFor(allPartial.length, isPoolRequest ? poolUnlockedTiers : unlockedPartial);

    const allFreelancerIds = Array.from(new Set([...allFull, ...allPartial].map((m: any) => m.freelancer_id)));
    const { data: requiredDaysData, error: requiredDaysError } = await (supabase.rpc as any)("request_required_days", {
      _request_id: data.request_id,
    });
    if (requiredDaysError) throw new Error(requiredDaysError.message);
    const requiredDays = ((requiredDaysData ?? []) as string[]).map((day) => String(day).slice(0, 10));
    const ratingAvg = new Map<string, { avg: number; count: number }>();
    const availabilityByFreelancer = new Map<string, Set<string>>();
    if (allFreelancerIds.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [{ data: allRatings }, { data: availableDays }] = await Promise.all([
        supabase
          .from("ratings")
          .select("to_user_id, stars, overall, unlocked_at")
          .in("to_user_id", allFreelancerIds)
          .not("unlocked_at", "is", null),
        requiredDays.length
          ? supabaseAdmin
              .from("availability")
              .select("freelancer_id, day")
              .in("freelancer_id", allFreelancerIds)
              .in("day", requiredDays)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      for (const r of (allRatings ?? []) as any[]) {
        const cur = ratingAvg.get(r.to_user_id) ?? { avg: 0, count: 0 };
        const v = Number(r.overall ?? r.stars ?? 0);
        const c = cur.count + 1;
        ratingAvg.set(r.to_user_id, { avg: (cur.avg * cur.count + v) / c, count: c });
      }
      for (const row of (availableDays ?? []) as any[]) {
        const fid = row.freelancer_id as string;
        const current = availabilityByFreelancer.get(fid) ?? new Set<string>();
        current.add(String(row.day).slice(0, 10));
        availabilityByFreelancer.set(fid, current);
      }
    }

    const matchIds = [...allFull, ...allPartial].map((m: any) => m.id);
    const freelancerIds = [...allFull, ...allPartial].map((m: any) => m.freelancer_id);
    const idsSafe = freelancerIds.length ? freelancerIds : ["00000000-0000-0000-0000-000000000000"];
    const midsSafe = matchIds.length ? matchIds : ["00000000-0000-0000-0000-000000000000"];
    const [{ data: fps }, { data: unlocks }] = await Promise.all([
      supabase.from("freelancer_profiles").select(FREELANCER_PROFILE_COLUMNS).in("user_id", idsSafe),
      supabase.from("match_unlocks").select("match_id, free_preview").eq("team_id", userId).in("match_id", midsSafe),
    ]);
    const fpMap = new Map((fps ?? []).map((r: any) => [r.user_id, r]));
    // Request owner (team) — rate stays behind the existing showTech gating below.
    {
      const { fetchRatesByIds } = await import("@/lib/rates.server");
      const rateMap = await fetchRatesByIds(freelancerIds);
      for (const [id, fp] of fpMap) Object.assign(fp as any, rateMap.get(id as string) ?? {});
    }
    const unlockMap = new Map((unlocks ?? []).map((r: any) => [r.match_id, r]));
    // One confirmation request per (pit call, freelancer): persisted state for the CTA
    const { data: reqEngagements } = await supabase
      .from("engagements")
      .select("id, freelancer_id, status")
      .eq("request_id", data.request_id)
      .eq("team_id", userId)
      .in("status", ["proposed", "confirmed", "completed"]);
    const confirmationRequested = new Map<string, string>(
      ((reqEngagements ?? []) as any[]).map((e) => [e.freelancer_id, e.id]),
    );
    const poolFreelancerIds = freelancerIds.filter((id: string) => poolSet.has(id));
    const poolProfileMap = new Map<string, any>();
    const poolContactMap = new Map<string, any>();
    const poolEmailMap = new Map<string, string | null>();
    if (poolFreelancerIds.length) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [{ data: poolProfiles }, { data: poolContacts }] = await Promise.all([
          supabaseAdmin.from("profiles").select("id, first_name, last_name, display_name, avatar_url").in("id", poolFreelancerIds),
          supabaseAdmin.from("freelancer_contacts").select("user_id, phone_dial_code, phone_number").in("user_id", poolFreelancerIds),
        ]);
        for (const p of (poolProfiles ?? []) as any[]) poolProfileMap.set(p.id, p);
        for (const c of (poolContacts ?? []) as any[]) poolContactMap.set(c.user_id, c);
        await Promise.all(
          poolFreelancerIds.map(async (fid) => {
            const { data: userData } = await supabaseAdmin.auth.admin.getUserById(fid);
            poolEmailMap.set(fid, userData?.user?.email ?? null);
          }),
        );
      } catch {
        // Pool identity is a convenience layer; keep match details resilient if contact lookup is unavailable.
      }
    }

    const buildItem = (m: any, i: number, scope: "full" | "partial", tierUnlockedSet: Set<number>) => {
      const rank = i + 1;
      const tier = rank <= 10 ? 1 : rank <= 10 + tier2Size ? 2 : 3;
      const tierUnlocked = tier === 1 || tierUnlockedSet.has(tier);
      const topThree = rank <= 3;
      const perProfileUnlocked = unlockMap.has(m.id);
      const fp = fpMap.get(m.freelancer_id);
      const inPool = poolSet.has(m.freelancer_id);
      const poolVisible = isPoolRequest && inPool;
      const showTech = poolVisible || (tierUnlocked && (topThree || perProfileUnlocked));
      const blurred = !poolVisible && tierUnlocked && !showTech;
      const poolProfile = poolProfileMap.get(m.freelancer_id);
      const poolContact = poolContactMap.get(m.freelancer_id);
      const legalName = [poolProfile?.first_name, poolProfile?.last_name].filter(Boolean).join(" ").trim();
      const availableSet = availabilityByFreelancer.get(m.freelancer_id) ?? new Set<string>();
      const missingDates = requiredDays.filter((day: string) => !availableSet.has(day));
      return {
        match_id: m.id,
        scope,
        rank,
        tier,
        tier_unlocked: tierUnlocked,
        blurred,
        top_three: topThree,
        // UI shows pure skills affinity; ordering uses final_score internally.
        match_score: Number(m.skills_score ?? m.match_score ?? 0),
        skills_score: Number(m.skills_score ?? m.match_score ?? 0),
        final_score: Number(m.final_score ?? m.match_score ?? 0),
        is_perfect: m.is_perfect,
        overlap_days: m.overlap_days,
        missing_days: Number(m.missing_days ?? 0),
        missing_dates: missingDates,
        missing_pct: Number(m.missing_pct ?? 0),
        is_partial: !!m.is_partial,
        edge_only: m.edge_only !== false,
        missing_criteria: m.missing_criteria ?? [],
        unlocked: showTech,
        free_preview: poolVisible || topThree || unlockMap.get(m.id)?.free_preview === true,
        freelancer_id: m.freelancer_id,
        in_pool: inPool,
        confirmation_requested: confirmationRequested.has(m.freelancer_id),
        engagement_id: confirmationRequested.get(m.freelancer_id) ?? null,
        rating: {
          average: ratingAvg.get(m.freelancer_id)?.avg ?? 0,
          count: ratingAvg.get(m.freelancer_id)?.count ?? 0,
        },
        profile: showTech
          ? {
              display_name: inPool ? legalName || poolProfile?.display_name || "Freelancer" : null,
              avatar_url: inPool ? poolProfile?.avatar_url ?? null : null,
              headline: fp?.headline ?? null,
              role_group: fp?.role_group ?? null,
              sub_roles: fp?.sub_roles ?? [],
              disciplines: fp?.disciplines ?? [],
              skills: fp?.skills ?? [],
              location: fp?.location ?? null,
              day_rate: fp?.day_rate ?? null,
              bio: fp?.bio ?? null,
              travels: fp?.travels ?? false,
              education: fp?.education ?? null,
              experiences: fp?.experiences ?? [],
              languages: fp?.languages ?? [],
              contact_email: inPool ? poolEmailMap.get(m.freelancer_id) ?? null : null,
              phone_dial_code: inPool ? poolContact?.phone_dial_code ?? null : null,
              phone_number: inPool ? poolContact?.phone_number ?? null : null,
            }
          : null,
      };
    };

    const itemsFull = allFull.map((m: any, i: number) => buildItem(m, i, "full", unlockedFull));
    const itemsPartial = allPartial.map((m: any, i: number) => buildItem(m, i, "partial", unlockedPartial));
    // Legacy `items` = full pool (existing UI code path)
    const items = itemsFull;

    // FOMO / service banner data
    const bestFullSkill = itemsFull.length ? Math.max(...itemsFull.map((i) => i.skills_score)) : 0;
    const bestPartialSkill = itemsPartial.length ? Math.max(...itemsPartial.map((i) => i.skills_score)) : 0;
    const partialBanner = itemsPartial.length === 0
      ? null
      : {
          case: bestPartialSkill > bestFullSkill ? ("A" as const) : ("B" as const),
          best_full_skill: Math.round(bestFullSkill),
          best_partial_skill: Math.round(bestPartialSkill),
          partial_count: itemsPartial.length,
        };

    let hired: any = null;
    if (req.status === "completed" || req.status === "filled") {
      const { data: eng } = await supabase
        .from("engagements")
        .select("*")
        .eq("request_id", data.request_id)
        .eq("status", "confirmed")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (eng) {
        const fid = (eng as any).freelancer_id as string;
        const { data: hFpRaw } = await supabase.from("freelancer_profiles").select(FREELANCER_PROFILE_COLUMNS).eq("user_id", fid).maybeSingle();
        const { fetchRatesByIds: fetchHiredRates } = await import("@/lib/rates.server");
        const hiredRate = (await fetchHiredRates([fid])).get(fid) ?? { day_rate: null, currency: null };
        const hFp = hFpRaw ? { ...(hFpRaw as any), ...hiredRate } : hFpRaw;
        let hEmail: string | null = null;
        let hPhone: { phone_dial_code: string | null; phone_number: string | null } = { phone_dial_code: null, phone_number: null };
        let hProf: { display_name?: string | null; avatar_url?: string | null } | null = null;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: p } = await supabaseAdmin.from("profiles").select("first_name, last_name, avatar_url").eq("id", fid).maybeSingle();
          if (p) {
            const legal = [(p as any).first_name, (p as any).last_name].filter(Boolean).join(" ").trim();
            hProf = { display_name: legal || null, avatar_url: (p as any).avatar_url };
          }
          const { data: c } = await supabaseAdmin.from("freelancer_contacts").select("phone_dial_code, phone_number").eq("user_id", fid).maybeSingle();
          if (c) hPhone = { phone_dial_code: (c as any).phone_dial_code, phone_number: (c as any).phone_number };
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(fid);
          hEmail = u?.user?.email ?? null;
        } catch { /* ignore */ }

        hired = {
          freelancer_id: fid,
          engagement_id: (eng as any).id,
          confirmed_at: (eng as any).updated_at,
          display_name: hProf?.display_name ?? "Freelancer",

          avatar_url: hProf?.avatar_url ?? null,
          headline: (hFp as any)?.headline ?? null,
          role_group: (hFp as any)?.role_group ?? null,
          sub_roles: (hFp as any)?.sub_roles ?? [],
          location: (hFp as any)?.location ?? null,
          day_rate: (hFp as any)?.day_rate ?? null,
          bio: (hFp as any)?.bio ?? null,
          disciplines: (hFp as any)?.disciplines ?? [],
          skills: (hFp as any)?.skills ?? [],
          contact_email: hEmail,
          phone_dial_code: hPhone.phone_dial_code,
          phone_number: hPhone.phone_number,
        };
      }
    }

    // ---- Refund quote for zero-match trivio ----
    const settingsRefund = await supabase
      .from("platform_settings")
      .select("key, value_num")
      .in("key", ["refund_min_pct", "refund_hard_penalty_pct"]);
    const rSet = new Map((settingsRefund.data ?? []).map((r: any) => [r.key, Number(r.value_num)]));
    const minPct = rSet.get("refund_min_pct") ?? 20;
    const dropPct = rSet.get("refund_hard_penalty_pct") ?? 10;

    let hardCount = 0;
    if ((req as any).role_hard) hardCount += 1;
    if ((req as any).travel_required) hardCount += 1;
    hardCount += ((req as any).skills_hard?.length ?? 0);
    if (((req as any).education?.length ?? 0) > 0) hardCount += 1;
    if ((req as any).location_relevance === "mandatory") hardCount += 1;
    for (const l of ((req as any).languages ?? []) as any[]) if (l?.hard) hardCount += 1;
    for (const e of ((req as any).experience_requirements ?? []) as any[]) if (e?.hard) hardCount += 1;

    const { data: spendRows } = await supabase
      .from("token_transactions")
      .select("delta")
      .eq("user_id", userId)
      .eq("ref_id", data.request_id)
      .eq("reason", "request_post");
    const spent = (spendRows ?? []).reduce((a: number, r: any) => a + (-Number(r.delta) || 0), 0);
    const pct = Math.max(0, Math.min(100, Math.max(minPct, 100 - hardCount * dropPct)));
    let refundFull = Math.round((spent * pct) / 100);
    if (spent > 0 && pct > 0 && refundFull < 1) refundFull = 1;
    const refundPartial = Math.max(refundFull > 0 ? 1 : 0, Math.round(refundFull / 2));

    // Matches nobody declined / let expire — drives the refund trivio after decline/expiry.
    const { data: confirmableLeft } = await supabase.rpc("request_confirmable_matches_left" as any, {
      _request_id: data.request_id,
    });

    return {
      request: req,
      in_review: inReview,
      review_deadline_at: (req as any).review_deadline_at ?? null,
      match_potential: ((req as any).initial_match_potential ?? null) as "strong" | "targeted" | "red" | null,
      confirmable_left: Number(confirmableLeft ?? 0),
      items,
      items_partial: itemsPartial,
      hired,
      tiers: tiersFull,
      tiers_partial: tiersPartial,
      per_profile_cost: perProfileCost,
      total_matches: allFull.length,
      total_partial_matches: allPartial.length,
      outside_pool_count: outsidePoolCount,
      upgrade_cost: isPoolRequest
        ? Math.max(
            0,
            Math.round(
              ((req as any).duration === "full_season"
                ? settings.get("cost_request_full_season") ?? 20
                : settings.get("cost_request_race_weekend") ?? 10) - (settings.get("cost_pool_search") ?? 5),
            ),
          )
        : 0,
      hard_cap: hardCap,
      partial_banner: partialBanner,
      refund_quote: {
        spent,
        hard_count: hardCount,
        min_pct: minPct,
        drop_pct: dropPct,
        refund_pct: pct,
        refund_full: refundFull,
        refund_partial: refundPartial,
      },
    };
  });

/** Convert a "My Pool" Pit Call into a standard one by paying the token difference. */
export const upgradeRequestToStandard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { request_id: string }) => z.object({ request_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    // Ownership, eligibility, server-side price, balance check, debit and the pool -> standard
    // transformation all happen inside one locked transaction (idempotent on retry/double-click).
    const { data: res, error } = await context.supabase.rpc("upgrade_request_to_standard" as any, {
      _request_id: data.request_id,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(res) ? (res as any[])[0] : (res as any);
    const cost = Number(row?.tokens_spent ?? 0);

    // Recompute runs after commit: it is derived state and is re-created by the normal
    // recompute pipeline (and by the pit call page) if this call fails.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("recompute_matches", {
      _freelancer_id: null,
      _request_id: data.request_id,
    } as never);

    return { ok: true, tokens_spent: cost };
  });

export const refundAndCloseRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { request_id: string; mode: "full" | "partial" }) =>
    z.object({ request_id: z.string().uuid(), mode: z.enum(["full", "partial"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("refund_and_close_request" as any, {
      _request_id: data.request_id,
      _mode: data.mode,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row as { refund_tokens: number; refund_pct: number; balance: number; kind: string };
  });



export const unlockMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { match_id: string }) => z.object({ match_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: balance, error } = await context.supabase.rpc("unlock_match_for_team", { _match_id: data.match_id });
    if (error) throw new Error(error.message);
    return { balance: balance as number };
  });

export const unlockRequestTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { request_id: string; tier: number; scope?: "full" | "partial" }) =>
    z.object({
      request_id: z.string().uuid(),
      tier: z.number().int().min(2).max(3),
      scope: z.enum(["full", "partial"]).default("full"),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("unlock_request_tier" as any, {
      _request_id: data.request_id,
      _tier: data.tier,
      _scope: data.scope ?? "full",
    } as any);
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      tier: Number(row?.tier ?? data.tier),
      scope: data.scope ?? "full",
      tokens_spent: Number(row?.tokens_spent ?? 0),
      balance: Number(row?.balance ?? 0),
      total_matches: Number(row?.total_matches ?? 0),
    };
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

export const getMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, kind, payload, created_at, read_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
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

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });



// ==================== RATINGS V2 (double-blind) ====================

export const submitRatingV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({
      engagement_id: z.string().uuid(),
      overall: z.number().min(1).max(5),
      sub_scores: z.object({
        technical: z.number().min(1).max(5).optional(),
        punctuality: z.number().min(1).max(5).optional(),
        stress: z.number().min(1).max(5).optional(),
      }).default({}),
      comment: z.string().max(500).optional().nullable(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("ratings")
      .select("id")
      .eq("engagement_id", data.engagement_id)
      .eq("from_user_id", context.userId)
      .maybeSingle();
    if (existing) {
      return { ok: false, already_rated: true } as const;
    }
    const { data: row, error } = await context.supabase.rpc("submit_rating_v2", {
      _engagement_id: data.engagement_id,
      _sub_scores: data.sub_scores,
      _overall: data.overall,
      _comment: data.comment ?? undefined,
    });
    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("ratings_engagement_id_from_user_id_key") || (error as any).code === "23505") {
        return { ok: false, already_rated: true } as const;
      }
      throw new Error(msg);
    }
    return { ok: true, row } as const;
  });

export const getUserRatingSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { user_id: string }) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("get_user_rating_summary", { _user_id: data.user_id });
    if (error) throw new Error(error.message);
    const r = (Array.isArray(rows) ? rows[0] : rows) as any;
    return {
      count: r?.count ?? 0,
      average: r?.average ? Number(r.average) : 0,
      technical: r?.tech ? Number(r.tech) : null,
      punctuality: r?.punct ? Number(r.punct) : null,
      stress: r?.stress ? Number(r.stress) : null,
    };
  });

export const unlockReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { target_user_id: string }) => z.object({ target_user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: bal, error } = await context.supabase.rpc("reveal_reviews", { _target: data.target_user_id });
    if (error) throw new Error(error.message);
    return { balance: bal as number };
  });

export const getAnonymousReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { target_user_id: string }) => z.object({ target_user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const isSelf = userId === data.target_user_id;
    let unlocked = isSelf;
    if (!isSelf) {
      const { data: u } = await context.supabase
        .from("review_unlocks")
        .select("id")
        .eq("user_id", userId)
        .eq("target_user_id", data.target_user_id)
        .maybeSingle();
      unlocked = !!u;
    }
    if (!unlocked) return { unlocked: false, reviews: [] as any[] };
    const { data: rows, error } = await context.supabase.rpc("get_anonymous_reviews", { _target: data.target_user_id });
    if (error) throw new Error(error.message);
    return { unlocked: true, reviews: (rows ?? []) as any[] };
  });

export const flagRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { rating_id: string; reason: string }) =>
    z.object({ rating_id: z.string().uuid(), reason: z.string().trim().min(10).max(2000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("flag_rating" as any, {
      _rating_id: data.rating_id,
      _reason: data.reason,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getRatableEngagements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: engs, error } = await supabase
      .from("engagements")
      .select("id, freelancer_id, team_id, start_date, end_date, status, request_id, request:requests(title, season_dates)")
      .in("status", ["confirmed", "completed"])
      .or(`freelancer_id.eq.${userId},team_id.eq.${userId}`);
    if (error) throw new Error(error.message);
    const items = [] as any[];
    for (const e of (engs ?? []) as any[]) {
      const { data: opens } = await supabase.rpc("rating_opens_at", { _engagement_id: e.id });
      const { data: mine } = await supabase.from("ratings").select("id, unlocked_at").eq("engagement_id", e.id).eq("from_user_id", userId).maybeSingle();
      items.push({ ...e, opens_at: opens, already_rated: !!mine, unlocked: !!(mine as any)?.unlocked_at });
    }
    return items;
  });


// ---- Cancellations & SOS Call ----
export const cancelEngagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({
      engagement_id: z.string().uuid(),
      reason: z.string().trim().max(500).optional().nullable(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("cancel_engagement", {
      _engagement_id: data.engagement_id,
      _reason: data.reason ?? undefined,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const triggerSosCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ request_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("trigger_sos_call", { _request_id: data.request_id });
    if (error) throw new Error(error.message);
    return row as { id: string; target_count: number; min_pct: number };
  });

export const acceptSosCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ sos_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("accept_sos_call", { _sos_id: data.sos_id });
    if (error) throw new Error(error.message);
    return row;
  });

export const getMyOpenSosCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: targets } = await supabase
      .from("sos_call_targets")
      .select("sos_id, skills_score, distance_km, sos:sos_calls(id, request_id, triggered_at, resolved_at, min_pct, team_id)")
      .eq("freelancer_id", userId);
    const open = (targets ?? []).filter((t: any) => t.sos && !t.sos.resolved_at);
    if (open.length === 0) return [] as any[];
    const requestIds = Array.from(new Set(open.map((o: any) => o.sos.request_id)));
    const teamIds = Array.from(new Set(open.map((o: any) => o.sos.team_id)));
    const [reqRes, teamRes] = await Promise.all([
      supabase.from("requests").select("id, title, role, discipline, start_date, end_date, location, circuit").in("id", requestIds),
      supabase.from("team_profiles").select("user_id, team_name, location").in("user_id", teamIds),
    ]);
    const rMap = new Map(((reqRes.data ?? []) as any[]).map((r) => [r.id, r]));
    const tMap = new Map(((teamRes.data ?? []) as any[]).map((r) => [r.user_id, r]));
    return open.map((o: any) => ({
      sos_id: o.sos.id,
      request: rMap.get(o.sos.request_id) ?? null,
      team: tMap.get(o.sos.team_id) ?? null,
      skills_score: Number(o.skills_score),
      distance_km: o.distance_km == null ? null : Number(o.distance_km),
      triggered_at: o.sos.triggered_at,
    }));
  });

export const getTeamCancellationStats = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ team_id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("engagements")
      .select("cancelled_at, start_date")
      .eq("team_id", data.team_id)
      .eq("cancellation_kind", "team_late");
    const count = (rows ?? []).length;
    return { count };
  });

// ---- Anti-Ghosting workflow ----
export const freelancerAnswerContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ engagement_id: z.string().uuid(), contacted: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("freelancer_answer_contact", {
      _engagement_id: data.engagement_id,
      _contacted: data.contacted,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const teamConfirmContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ engagement_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("team_confirm_contact", {
      _engagement_id: data.engagement_id,
    });
    if (error) throw new Error(error.message);
    return row;
  });

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin only");
}

export const adminEmitContactChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("emit_contact_checks");
    if (error) throw new Error(error.message);
    return { inserted: (data as number) ?? 0 };
  });

export const adminEmitTeamGhostingReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("emit_team_ghosting_reminders");
    if (error) throw new Error(error.message);
    return { inserted: (data as number) ?? 0 };
  });

export const adminReleaseGhostedEngagements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("release_ghosted_engagements");
    if (error) throw new Error(error.message);
    return { released: (data as number) ?? 0 };
  });
