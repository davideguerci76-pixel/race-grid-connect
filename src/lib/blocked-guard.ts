import { createMiddleware } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * REM-W1 / MT01-M1 — an Admin block must stop ALREADY authenticated sessions.
 *
 * Every server function RPC carries the Supabase bearer token (see
 * `attachSupabaseAuth`). This request middleware is the single central place
 * where a still-valid token belonging to a blocked or deleted account is
 * rejected, without waiting for the token to expire.
 *
 * The database is the other half of the enforcement: RLS policies on every
 * user-writable table also test `user_is_blocked(auth.uid())`, so direct
 * PostgREST calls from the browser are denied too.
 */
export const blockedAccountMiddleware = createMiddleware().server(async ({ next, request }) => {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return next();

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return next();

  try {
    const supabase = createClient<Database>(url, key, {
      global: { headers: { Authorization: auth } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data } = await (supabase as any).rpc("my_account_status");
    const row = Array.isArray(data) ? data[0] : data;
    if (row && (row.blocked === true || row.deleted === true)) {
      return new Response(
        JSON.stringify({ error: row.deleted ? "ACCOUNT_DELETED" : "ACCOUNT_BLOCKED" }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }
  } catch {
    // Never turn an availability problem into a lockout of healthy accounts.
    return next();
  }

  return next();
});
