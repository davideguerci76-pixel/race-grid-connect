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

/** All submissions (pending / approved / rejected) + official platform calendars. */
export const adminListCalendars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin.from("user_calendars" as never) as any)
      .select("*")
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

/** Approve (optionally rename) a submitted calendar and credit the reward tokens to its author. */
export const adminApproveCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), name: z.string().min(1).max(120).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: readErr } = await (supabaseAdmin.from("user_calendars" as never) as any)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!existing) throw new Error("Calendar not found");
    const alreadyApproved = existing.review_status === "approved";

    const { data: row, error } = await (supabaseAdmin.from("user_calendars" as never) as any)
      .update({
        review_status: "approved",
        name: data.name ?? existing.name,
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
        review_note: null,
      })
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);

    let credited = 0;
    if (!alreadyApproved && existing.owner_id !== context.userId) {
      const { data: setting } = await supabaseAdmin.from("platform_settings").select("value_num").eq("key", "reward_calendar_approved").maybeSingle();
      const reward = Math.round(Number((setting as any)?.value_num ?? 5));
      if (reward > 0) {
        const { data: profile } = await supabaseAdmin.from("profiles").select("token_balance").eq("id", existing.owner_id).maybeSingle();
        const balance = Number((profile as any)?.token_balance ?? 0) + reward;
        await supabaseAdmin.from("profiles").update({ token_balance: balance }).eq("id", existing.owner_id);
        await supabaseAdmin.from("token_transactions").insert({
          user_id: existing.owner_id,
          delta: reward,
          reason: "admin_credit",
          ref_id: existing.id,
          note: `Calendar approved: ${data.name ?? existing.name}`,
        } as any);
        await supabaseAdmin.from("notifications").insert({
          user_id: existing.owner_id,
          kind: "tokens_credited",
          payload: { reason: "calendar_approved", calendar: data.name ?? existing.name, tokens: reward },
        } as any);
        credited = reward;
      }
    }
    return { calendar: normalize(row, ""), credited };
  });

export const adminRejectCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), note: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("user_calendars" as never) as any)
      .update({ review_status: "rejected", review_note: data.note ?? null, reviewed_at: new Date().toISOString(), reviewed_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRenameCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("user_calendars" as never) as any).update({ name: data.name }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Create/replace an official platform calendar (manual entry or .ics import, admin-owned, approved). */
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
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      owner_id: context.userId,
      name: data.name,
      discipline: data.discipline ?? null,
      season_year: data.season_year ?? null,
      events: data.events,
      dates: [...new Set(data.dates)].sort(),
      source: data.source,
      review_status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: context.userId,
    };
    const q = data.id
      ? (supabaseAdmin.from("user_calendars" as never) as any).update(payload).eq("id", data.id).select("*").maybeSingle()
      : (supabaseAdmin.from("user_calendars" as never) as any).insert(payload).select("*").maybeSingle();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return normalize(row, "Platform");
  });

export const adminDeleteCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("user_calendars" as never) as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
