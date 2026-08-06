import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const eventSchema = z.object({
  title: z.string().min(1).max(160),
  start: isoDate,
  end: isoDate,
});

export type UserCalendar = {
  id: string;
  owner_id: string;
  name: string;
  discipline: string | null;
  season_year: number | null;
  events: Array<{ title: string; start: string; end: string }>;
  dates: string[];
  source: string;
  review_status: string;
  review_note: string | null;
  updated_at: string;
};

function normalize(row: any): UserCalendar {
  return {
    id: row.id,
    owner_id: row.owner_id,
    name: row.name,
    discipline: row.discipline ?? null,
    season_year: row.season_year ?? null,
    events: Array.isArray(row.events) ? row.events : [],
    dates: Array.isArray(row.dates) ? row.dates : [],
    source: row.source,
    review_status: row.review_status,
    review_note: row.review_note ?? null,
    updated_at: row.updated_at,
  };
}

/** Personal archive + globally approved calendars. */
export const listMyCalendars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [mine, shared] = await Promise.all([
      (supabase.from("user_calendars" as never) as any).select("*").eq("owner_id", userId).order("updated_at", { ascending: false }),
      (supabase.from("user_calendars" as never) as any)
        .select("*")
        .eq("review_status", "approved")
        .neq("owner_id", userId)
        .order("name", { ascending: true }),
    ]);
    if (mine.error) throw new Error(mine.error.message);
    if (shared.error) throw new Error(shared.error.message);
    return {
      mine: (mine.data ?? []).map(normalize),
      shared: (shared.data ?? []).map(normalize),
    };
  });

export const saveCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        discipline: z.string().max(64).nullable().optional(),
        season_year: z.number().int().min(1950).max(2100).nullable().optional(),
        events: z.array(eventSchema).max(200),
        dates: z.array(isoDate).max(400),
        source: z.enum(["manual", "ics"]).default("manual"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      owner_id: userId,
      name: data.name,
      discipline: data.discipline ?? null,
      season_year: data.season_year ?? null,
      events: data.events,
      dates: [...new Set(data.dates)].sort(),
      source: data.source,
    };
    if (data.id) {
      const { data: row, error } = await (supabase.from("user_calendars" as never) as any)
        .update(payload)
        .eq("id", data.id)
        .eq("owner_id", userId)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return row ? normalize(row) : null;
    }
    const { data: row, error } = await (supabase.from("user_calendars" as never) as any).insert(payload).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return row ? normalize(row) : null;
  });

export const deleteCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.from("user_calendars" as never) as any)
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Crowdsourcing: submit a personal calendar to the platform for global approval. */
export const submitCalendarForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid(), note: z.string().max(500).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase.from("user_calendars" as never) as any)
      .update({ review_status: "pending", review_note: data.note ?? null, submitted_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("owner_id", userId)
      .in("review_status", ["private", "rejected"])
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Calendar not found or already submitted");
    return normalize(row);
  });
