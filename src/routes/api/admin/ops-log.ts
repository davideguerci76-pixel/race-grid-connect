// OPS-MON-02 — Operational event log export (TXT). Admin-only; read through the caller's RLS context
// (the log is Admin-readable by policy), so no service-role client is needed here. Read-only.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { renderOpsLogTxt, type OpsLogRow } from "@/lib/ops-log-export";

const LIMIT = 20_000;

function deny(status: number, error: string) {
  return new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export const Route = createFileRoute("/api/admin/ops-log")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !key) return deny(500, "SERVER_MISCONFIGURED");

        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) return deny(401, "UNAUTHENTICATED");
        const token = authHeader.slice(7);
        if (token.split(".").length !== 3) return deny(401, "UNAUTHENTICATED");
        const supabase = createClient<Database>(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
        const userId = claimsData?.claims?.["sub"] as string | undefined;
        if (claimsErr || !userId) return deny(401, "UNAUTHENTICATED");
        const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
        if (!role) return deny(403, "FORBIDDEN");

        const q = new URL(request.url).searchParams;
        const environment = q.get("env") === "test" ? "test" : "live";
        const now = new Date();
        const to = q.get("to") ? new Date(q.get("to")!) : now;
        const from = q.get("from") ? new Date(q.get("from")!) : new Date(to.getTime() - 7 * 86_400_000);
        if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return deny(400, "BAD_RANGE");

        const { data, error } = await supabase
          .from("operational_event_log")
          .select("occurred_at, environment, severity, event_type, result, actor_type, actor_user_id, entity_type, entity_id, secondary_entity_type, secondary_entity_id, reference_id, error_code, metadata")
          .eq("environment", environment)
          .gte("occurred_at", from.toISOString())
          .lte("occurred_at", to.toISOString())
          .order("occurred_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(LIMIT + 1);
        if (error) return deny(500, "EXPORT_FAILED");

        const rows = (data ?? []) as unknown as OpsLogRow[];
        const truncated = rows.length > LIMIT;
        const txt = renderOpsLogTxt(rows.slice(0, LIMIT), {
          environment, from: from.toISOString(), to: to.toISOString(), generatedAt: now.toISOString(), generatedBy: userId, truncated, limit: LIMIT,
        });
        const name = `pitcall-ops-log-${environment}-${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.txt`;
        return new Response(txt, {
          headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
        });
      },
    },
  },
});
