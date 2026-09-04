import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const eventSchema = z.object({ title: z.string().min(1).max(160), start: isoDate, end: isoDate });

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

/** Admin authority = admin role + the environment (TEST/LIVE) currently selected in the control panel. */
async function adminScope(context: any) {
  await assertAdmin(context.supabase, context.userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { currentAdminEnv } = await import("@/lib/admin-env.server");
  const isTest = await currentAdminEnv(supabaseAdmin, context.userId);
  return { supabaseAdmin, isTest };
}

export type AdminCalendar = {
  id: string;
  owner_id: string;
  owner_name: string;
  name: string;
  discipline: string | null;
  season_year: number | null;
  events: Array<{ title: string; start: string; end: string }>;
  dates: string[];
  source: string;
  review_status: string;
  review_note: string | null;
  submitted_at: string | null;
  updated_at: string;
};

function normalize(row: any, ownerName: string): AdminCalendar {
  return {
    id: row.id,
    owner_id: row.owner_id,
    owner_name: ownerName,
    name: row.name,
    discipline: row.discipline ?? null,
    season_year: row.season_year ?? null,
    events: Array.isArray(row.events) ? row.events : [],
    dates: Array.isArray(row.dates) ? row.dates : [],
    source: row.source,
    review_status: row.review_status,
    review_note: row.review_note ?? null,
    submitted_at: row.submitted_at ?? null,
    updated_at: row.updated_at,
  };
}

/** All submissions (pending / approved / rejected) + official platform calendars, current environment only. */
export const adminListCalendars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, isTest } = await adminScope(context);
    const { data, error } = await (supabaseAdmin.from("user_calendars" as never) as any)
      .select("*")
      .eq("is_test", isTest)
      .in("review_status", ["pending", "approved", "rejected"])
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const ownerIds = [...new Set(rows.map((r: any) => r.owner_id))];
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", ownerIds as string[]);
    const names = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));
    return rows.map((r: any) => normalize(r, names.get(r.owner_id) ?? "Unknown"));
  });

/**
 * Approve (optionally rename) a submitted calendar and credit the reward tokens to its author.
 * Atomic + environment-checked + idempotent: the DB function locks the row, preserves the original
 * owner and pays at most one reward through the canonical credit_tokens primitive.
 */
export const adminApproveCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), name: z.string().min(1).max(120).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await adminScope(context);
    const { data: res, error } = await (supabaseAdmin.rpc as any)("admin_approve_calendar", {
      _admin_id: context.userId,
      _calendar_id: data.id,
      _name: data.name ?? null,
    });
    if (error) throw new Error(error.message);
    return { credited: Number((res as any)?.credited ?? 0), already_approved: !!(res as any)?.already_approved };
  });

export const adminRejectCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), note: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, isTest } = await adminScope(context);
    const { data: row, error } = await (supabaseAdmin.from("user_calendars" as never) as any)
      .update({ review_status: "rejected", review_note: data.note ?? null, reviewed_at: new Date().toISOString(), reviewed_by: context.userId })
      .eq("id", data.id)
      .eq("is_test", isTest)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Calendar not found in the current environment");
    return { ok: true };
  });

export const adminRenameCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, isTest } = await adminScope(context);
    const { data: row, error } = await (supabaseAdmin.from("user_calendars" as never) as any)
      .update({ name: data.name })
      .eq("id", data.id)
      .eq("is_test", isTest)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Calendar not found in the current environment");
    return { ok: true };
  });

/**
 * Create an official platform calendar, or moderate an existing submission (dates/name/metadata)
 * and publish it. Moderation NEVER rewrites owner_id or is_test: the original creator keeps
 * attribution, environment and reward eligibility, and publishing goes through the same
 * atomic approval path as a direct approve.
 */
export const adminUpsertOfficialCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        discipline: z.string().max(64).nullable().optional(),
        season_year: z.number().int().min(1950).max(2100).nullable().optional(),
        events: z.array(eventSchema).max(300),
        dates: z.array(isoDate).max(600),
        source: z.enum(["manual", "ics"]).default("manual"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, isTest } = await adminScope(context);
    const base = {
      name: data.name,
      discipline: data.discipline ?? null,
      season_year: data.season_year ?? null,
      events: data.events,
      dates: [...new Set(data.dates)].sort(),
      source: data.source,
    };

    if (data.id) {
      // Moderation edit: content only — owner_id, is_test and review_status are untouched here.
      const { data: row, error } = await (supabaseAdmin.from("user_calendars" as never) as any)
        .update(base)
        .eq("id", data.id)
        .eq("is_test", isTest)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Calendar not found in the current environment");

      // Publish through the same atomic approval path (owner preserved, one reward).
      const { data: res, error: approveErr } = await (supabaseAdmin.rpc as any)("admin_approve_calendar", {
        _admin_id: context.userId,
        _calendar_id: data.id,
        _name: data.name,
      });
      if (approveErr) throw new Error(approveErr.message);

      const { data: fresh } = await (supabaseAdmin.from("user_calendars" as never) as any).select("*").eq("id", data.id).maybeSingle();
      return { ...normalize(fresh ?? row, ""), credited: Number((res as any)?.credited ?? 0) } as AdminCalendar & { credited: number };
    }

    const { data: row, error } = await (supabaseAdmin.from("user_calendars" as never) as any)
      .insert({
        ...base,
        owner_id: context.userId,
        is_test: isTest,
        review_status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ...normalize(row, "Platform"), credited: 0 } as AdminCalendar & { credited: number };
  });

export const adminDeleteCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, isTest } = await adminScope(context);
    const { data: row, error } = await (supabaseAdmin.from("user_calendars" as never) as any)
      .delete()
      .eq("id", data.id)
      .eq("is_test", isTest)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Calendar not found in the current environment");
    return { ok: true };
  });
