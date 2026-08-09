import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const nameSchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[\p{L}][\p{L}\p{M}'’\-. ]*$/u, "INVALID_NAME");

/**
 * Sets the freelancer legal first/last name exactly once. Once stored the
 * fields are immutable from the app: any later call is rejected.
 * On an exact homonym an admin alert notification is emitted.
 */
export const setMyLegalName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ first_name: nameSchema, last_name: nameSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: current, error: readError } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if ((current as any)?.first_name && (current as any)?.last_name) {
      throw new Error("NAME_LOCKED");
    }

    const first = data.first_name.replace(/\s+/g, " ");
    const last = data.last_name.replace(/\s+/g, " ");

    const { data: row, error } = await supabase
      .from("profiles")
      .update({ first_name: first, last_name: last } as never)
      .eq("id", userId)
      .select("id, first_name, last_name, display_name, user_type")
      .single();
    if (error) throw new Error(error.message);

    // Homonym detection + admin alert (privileged: needs to read other profiles).
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: dupes } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, first_name, last_name")
        .ilike("first_name", first)
        .ilike("last_name", last)
        .neq("id", userId);

      if (dupes && dupes.length > 0) {
        const { data: admins } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        const payload = {
          type: "homonym",
          message: `Homonym detected: ${first} ${last} — verify duplicate freelancer identities.`,
          first_name: first,
          last_name: last,
          user_id: userId,
          duplicates: (dupes as any[]).map((d) => ({ id: d.id, display_name: d.display_name })),
        };
        const rows = (admins ?? []).map((a: any) => ({
          user_id: a.user_id,
          kind: "admin_alert" as never,
          payload: payload as never,
        }));
        if (rows.length) await supabaseAdmin.from("notifications").insert(rows as never);
      }
    } catch {
      // Never block the user's profile completion on the alerting path.
    }

    return row;
  });
