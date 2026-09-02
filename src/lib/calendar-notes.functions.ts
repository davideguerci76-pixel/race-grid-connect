import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { daysBetweenIso } from "@/lib/calendar-days";

export type CalendarDayNote = { day: string; note: string; busy: boolean };

/** Private per-day notes. Never used by matching, score, ranking or Team-facing views. */
export const getMyDayNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("calendar_day_notes")
      .select("day, note, busy")
      .eq("freelancer_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({ day: String(r.day).slice(0, 10), note: r.note, busy: !!r.busy })) as CalendarDayNote[];
  });

/** Red (PITCALL-generated) days with their public context: team, location, role. */
export const getMyEngagementDays = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("engagements")
      .select(
        "id, team_id, request_id, start_date, end_date, status, cancellation_kind, covered_days, request:requests(id, title, role_group, sub_role, location, circuit, start_date, end_date, season_dates)",
      )
      .eq("freelancer_id", userId)
      .in("status", ["confirmed", "completed", "cancelled"]);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    const relevant = rows.filter((r) => r.status !== "cancelled" || r.cancellation_kind === "team_late");
    const teamIds = Array.from(new Set(relevant.map((r) => r.team_id)));
    const nameMap = new Map<string, string>();
    if (teamIds.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: tps } = await supabaseAdmin.from("team_profiles").select("user_id, team_name").in("user_id", teamIds);
      for (const t of (tps ?? []) as any[]) nameMap.set(t.user_id, t.team_name);
    }

    // The freelancer may not be able to read the request row directly (RLS), so the
    // public Pit Call context (location, role) is resolved server-side, like the team name.
    const reqIds = Array.from(new Set(relevant.map((r) => r.request_id).filter(Boolean)));
    const reqMap = new Map<string, any>();
    if (reqIds.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: reqs } = await supabaseAdmin
        .from("requests")
        .select("id, title, role_group, sub_role, location, circuit, start_date, end_date, season_dates")
        .in("id", reqIds as string[]);
      for (const q of (reqs ?? []) as any[]) reqMap.set(q.id, q);
    }

    const out: Array<{
      day: string;
      engagement_id: string;
      locked: boolean;
      team: string | null;
      location: string | null;
      role: string | null;
      sub_role: string | null;
      title: string | null;
    }> = [];
    for (const r of relevant) {
      const req = r.request ?? reqMap.get(r.request_id) ?? null;
      const season = Array.isArray(req?.season_dates) ? req.season_dates : [];
      const days = season.length
        ? season.map((d: string) => String(d).slice(0, 10))
        : daysBetweenIso(req?.start_date ?? r.start_date, req?.end_date ?? r.end_date);
      for (const day of days) {
        out.push({
          day,
          engagement_id: r.id,
          locked: r.status === "cancelled",
          team: nameMap.get(r.team_id) ?? null,
          location: req?.circuit ?? req?.location ?? null,
          role: req?.role_group ?? null,
          sub_role: req?.sub_role ?? null,
          title: req?.title ?? null,
        });
      }
    }
    return out;
  });

/** Create/update/remove a private note. Red days are rejected server-side. */
export const setMyDayNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().max(60), busy: z.boolean().default(false) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const note = data.note.trim();

    if (!note && !data.busy) {
      const { error } = await supabase.from("calendar_day_notes").delete().eq("freelancer_id", userId).eq("day", data.day);
      if (error) throw new Error(error.message);
      return { ok: true, removed: true };
    }
    if (!note) throw new Error("NOTE_REQUIRED");

    const { error } = await supabase
      .from("calendar_day_notes")
      .upsert({ freelancer_id: userId, day: data.day, note, busy: data.busy }, { onConflict: "freelancer_id,day" });
    if (error) throw new Error(error.message);

    if (data.busy) {
      const { error: aErr } = await supabase.from("availability").delete().eq("freelancer_id", userId).eq("day", data.day);
      if (aErr) throw new Error(aErr.message);
    }
    return { ok: true, removed: false };
  });

/**
 * Apply a saved calendar as BUSY.
 * `protectedDays` (red PITCALL days) are never touched. Existing busy notes are
 * reported as conflicts unless `overwrite` is true.
 */
export const applySavedCalendarAsBusy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(400),
        label: z.string().trim().min(1).max(60),
        protectedDays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(800).default([]),
        overwrite: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const blocked = new Set(data.protectedDays);
    const targets = [...new Set(data.dates)].filter((d) => !blocked.has(d)).sort();
    if (!targets.length) return { applied: 0, skipped: data.dates.length, conflicts: [] as CalendarDayNote[] };

    const { data: existing, error: exErr } = await supabase
      .from("calendar_day_notes")
      .select("day, note, busy")
      .eq("freelancer_id", userId)
      .in("day", targets);
    if (exErr) throw new Error(exErr.message);

    const conflicts = ((existing ?? []) as any[])
      .filter((r) => r.busy && r.note !== data.label)
      .map((r) => ({ day: String(r.day).slice(0, 10), note: r.note, busy: true }));

    if (conflicts.length && !data.overwrite) {
      return { applied: 0, skipped: data.dates.length - targets.length, conflicts };
    }

    const conflictDays = new Set(conflicts.map((c) => c.day));
    const toWrite = data.overwrite ? targets : targets.filter((d) => !conflictDays.has(d));

    const { error } = await supabase
      .from("calendar_day_notes")
      .upsert(
        toWrite.map((day) => ({ freelancer_id: userId, day, note: data.label, busy: true })),
        { onConflict: "freelancer_id,day" },
      );
    if (error) throw new Error(error.message);

    const { error: aErr } = await supabase.from("availability").delete().eq("freelancer_id", userId).in("day", toWrite);
    if (aErr) throw new Error(aErr.message);

    return { applied: toWrite.length, skipped: data.dates.length - targets.length, conflicts: [] as CalendarDayNote[] };
  });

/** Team calendar: read-only view of confirmed PITCALL engagements. */
export const getTeamCalendarDays = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("engagements")
      .select(
        "id, freelancer_id, request_id, start_date, end_date, status, request:requests(id, title, role_group, sub_role, location, circuit, start_date, end_date, season_dates)",
      )
      .eq("team_id", userId)
      .in("status", ["confirmed", "completed"]);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    const ids = Array.from(new Set(rows.map((r) => r.freelancer_id)));
    const nameMap = new Map<string, string>();
    if (ids.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: ps } = await supabaseAdmin.from("profiles").select("id, display_name, first_name, last_name").in("id", ids);
      for (const p of (ps ?? []) as any[]) {
        const legal = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
        nameMap.set(p.id, legal || p.display_name || "");
      }
    }

    const out: Array<{
      day: string;
      engagement_id: string;
      request_id: string | null;
      freelancer: string;
      role: string | null;
      sub_role: string | null;
      location: string | null;
      title: string | null;
    }> = [];
    for (const r of rows) {
      const season = Array.isArray(r.request?.season_dates) ? r.request.season_dates : [];
      const days = season.length
        ? season.map((d: string) => String(d).slice(0, 10))
        : daysBetweenIso(r.request?.start_date ?? r.start_date, r.request?.end_date ?? r.end_date);
      for (const day of days) {
        out.push({
          day,
          engagement_id: r.id,
          request_id: r.request_id ?? null,
          freelancer: nameMap.get(r.freelancer_id) ?? "",
          role: r.request?.role_group ?? null,
          sub_role: r.request?.sub_role ?? null,
          location: r.request?.circuit ?? r.request?.location ?? null,
          title: r.request?.title ?? null,
        });
      }
    }
    return out;
  });
