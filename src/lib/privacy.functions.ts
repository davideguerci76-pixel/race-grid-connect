import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * GDPR art. 20 — data portability.
 * Returns everything Pit Call stores about the calling user, as plain JSON.
 */
export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const pick = async (table: string, column: string) => {
      const { data } = await (supabase as any).from(table).select("*").eq(column, userId);
      return data ?? [];
    };

    const [profile, freelancerProfile, teamProfile, contacts, availability, calendars, notifications, tokens] =
      await Promise.all([
        (supabase as any).from("profiles").select("*").eq("id", userId).maybeSingle(),
        (supabase as any).from("freelancer_profiles").select("*").eq("user_id", userId).maybeSingle(),
        (supabase as any).from("team_profiles").select("*").eq("user_id", userId).maybeSingle(),
        (supabase as any).from("freelancer_contacts").select("*").eq("user_id", userId).maybeSingle(),
        pick("availability", "freelancer_id"),
        pick("user_calendars", "owner_id"),
        pick("notifications", "user_id"),
        pick("token_transactions", "user_id"),
      ]);

    const ratingsWritten = await pick("ratings", "from_user_id");

    return {
      exported_at: new Date().toISOString(),
      account: profile?.data ?? null,
      freelancer_profile: freelancerProfile?.data ?? null,
      team_profile: teamProfile?.data ?? null,
      contacts: contacts?.data ?? null,
      availability,
      calendars,
      notifications,
      token_transactions: tokens,
      ratings_written_by_me: ratingsWritten,
    };
  });

/**
 * GDPR art. 17 — right to erasure.
 * Removes profile data, contacts, availability and calendars, anonymises the
 * ratings this user wrote about others (which stay valid as platform content)
 * and deletes the auth account. Irreversible.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ confirm: z.literal("DELETE") }).parse(data))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Block deletion while an engagement is still running: the counterparty has
    // a legitimate interest in the ongoing booking.
    const { data: active } = await (supabase as any)
      .from("engagements")
      .select("id, status")
      .or(`freelancer_id.eq.${userId},team_id.eq.${userId}`)
      .in("status", ["confirmed", "pending"]);
    if (active && active.length > 0) throw new Error("ACTIVE_ENGAGEMENTS");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("availability").delete().eq("freelancer_id", userId);
    await supabaseAdmin.from("user_calendars").delete().eq("owner_id", userId);
    await supabaseAdmin.from("freelancer_contacts").delete().eq("user_id", userId);
    await supabaseAdmin.from("freelancer_profiles").delete().eq("user_id", userId);
    await supabaseAdmin.from("team_profiles").delete().eq("user_id", userId);
    await supabaseAdmin.from("notifications").delete().eq("user_id", userId);
    await supabaseAdmin.from("team_pool").delete().eq("freelancer_id", userId);

    // Ratings written by the user stay, stripped of free text.
    await supabaseAdmin
      .from("ratings")
      .update({ comment: null } as never)
      .eq("from_user_id", userId);

    await supabaseAdmin
      .from("profiles")
      .update({
        display_name: "Deleted user",
        first_name: null,
        last_name: null,
        avatar_url: null,
        blocked_at: new Date().toISOString(),
      } as never)
      .eq("id", userId);

    await supabaseAdmin.auth.admin.deleteUser(userId);

    return { ok: true };
  });

/** Current published version of Terms + Privacy Policy. */
export const LEGAL_VERSION = "2026-08";

/**
 * Stores proof that the user accepted Terms and Privacy Policy.
 * Writes the append-only history row and the current state on `profiles`
 * atomically inside a single database function.
 */
export const recordLegalAcceptance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ source: z.enum(["signup", "reacceptance", "profile"]).optional() })
      .optional()
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("record_legal_acceptance", {
      _version: LEGAL_VERSION,
      _source: data?.source ?? "signup",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
