import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FREELANCER_PROFILE_COLUMNS, TEAM_PROFILE_COLUMNS } from "@/lib/profile-columns";

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

    const [profile, freelancerProfile, teamProfile, teamVat, myCoords, myRate, contacts, availability, calendars, notifications, tokens] =
      await Promise.all([
        (supabase as any).from("profiles").select("*").eq("id", userId).maybeSingle(),
        (supabase as any).from("freelancer_profiles").select(FREELANCER_PROFILE_COLUMNS).eq("user_id", userId).maybeSingle(),
        (supabase as any).from("team_profiles").select(TEAM_PROFILE_COLUMNS).eq("user_id", userId).maybeSingle(),
        (supabase as any).rpc("my_team_vat"),
        (supabase as any).rpc("my_profile_coords"),
        (supabase as any).rpc("my_day_rate"),
        (supabase as any).from("freelancer_contacts").select("*").eq("user_id", userId).maybeSingle(),
        pick("availability", "freelancer_id"),
        pick("user_calendars", "owner_id"),
        pick("notifications", "user_id"),
        pick("token_transactions", "user_id"),
      ]);

    const ratingsWritten = await pick("ratings", "from_user_id");
    const coordsRow = Array.isArray(myCoords?.data) ? (myCoords.data[0] as any) : null;
    const coords = { location_lat: coordsRow?.location_lat ?? null, location_lng: coordsRow?.location_lng ?? null };
    const rateRow = Array.isArray(myRate?.data) ? (myRate.data[0] as any) : null;

    return {
      exported_at: new Date().toISOString(),
      account: profile?.data ?? null,
      freelancer_profile: freelancerProfile?.data ? { ...freelancerProfile.data, ...coords, ...(rateRow ?? { day_rate: null, currency: null }) } : null,
      team_profile: teamProfile?.data ? { ...teamProfile.data, ...coords, vat_number: (teamVat?.data as string | null) ?? null } : null,
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
 *
 * Two phases, and only the first one can be transactional:
 *  1. `delete_my_account()` runs as ONE database transaction: the active
 *     engagement guard, the removal of owner-private data, the
 *     de-identification of shared content and the `deleted_at` marker either
 *     all happen or none of them do. It is advisory-locked and idempotent, so
 *     a retry never produces a second destructive pass.
 *  2. Deleting the Auth identity is an external call that cannot join that
 *     transaction. It runs only AFTER phase 1 committed, so the worst case is
 *     an identity that still exists but whose profile is already flagged
 *     deleted+blocked — that account can no longer perform any protected
 *     action, and calling this function again finishes the job.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ confirm: z.literal("DELETE") }).parse(data))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: res, error: dbError } = await (supabase as any).rpc("delete_my_account");
    if (dbError) {
      // Nothing was committed: the transaction rolled back as a whole.
      const m = dbError.message as string;
      if (m.includes("ACTIVE_ENGAGEMENTS")) throw new Error("ACTIVE_ENGAGEMENTS");
      if (m.includes("OPEN_PIT_CALLS_EXIST")) throw new Error("OPEN_PIT_CALLS_EXIST");
      throw new Error(m);
    }

    // ACC-DEL-01.A retention safety gate: when append-only economic/legal
    // records exist, the data is purged and the profile de-identified, but the
    // Auth identity is NOT hard-deleted (that retention law is not defined yet).
    if ((res as any)?.identity_hard_delete_allowed === false) {
      return { ok: true, state: (res as any)?.state ?? "db_purged_retained", identity_deleted: false };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      // No false success: the caller is told the account is disabled but the
      // sign-in identity still has to be removed, and a retry is safe.
      throw new Error("DELETION_INCOMPLETE");
    }

    await (supabaseAdmin as any).rpc("mark_account_identity_deleted", { _user_id: userId });

    return { ok: true, state: "complete", identity_deleted: true };
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
