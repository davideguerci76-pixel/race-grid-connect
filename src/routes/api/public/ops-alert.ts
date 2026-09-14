import { createFileRoute } from "@tanstack/react-router";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { describeOpsAlert } from "@/lib/ops-alert-format";

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// OPS-MON-02 — P0 alert mailer. Called by dispatch_ops_alerts() (pg_net) only when a LIVE alert is pending.
// State machine lives in the database (ops_alert_state): this route only renders + sends + reports back.
export const Route = createFileRoute("/api/public/ops-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const provided = request.headers.get("x-hook-secret") ?? "";
        const { data: cfg } = await supabaseAdmin.from("email_hook_config" as never).select("secret").maybeSingle<{ secret: string }>();
        if (!cfg?.secret || !timingSafeEqual(provided, cfg.secret)) return new Response("Unauthorized", { status: 401 });

        const { data: pending, error } = await (supabaseAdmin.rpc as any)("ops_alerts_take_pending");
        if (error) return new Response(error.message, { status: 500 });

        let sent = 0, failed = 0;
        for (const a of (pending ?? []) as any[]) {
          // Defence in depth: TEST never alerts, whatever the DB row says.
          if (a.environment !== "live") { await (supabaseAdmin.rpc as any)("ops_alert_mark_notified", { p_key: a.alert_key, p_sent: true }); continue; }
          const d = describeOpsAlert(a);
          try {
            const r = await sendTemplateEmail("opsAlert", "info@pitcall.net", {
              templateData: d,
              idempotencyKey: `ops-alert-${a.alert_key}-${a.notify_kind}-${a.updated_at}`,
            });
            await (supabaseAdmin.rpc as any)("ops_alert_mark_notified", { p_key: a.alert_key, p_sent: r.sent, p_error: r.sent ? null : "recipient_suppressed" });
            r.sent ? sent++ : failed++;
          } catch (e) {
            failed++;
            await (supabaseAdmin.rpc as any)("ops_alert_mark_notified", { p_key: a.alert_key, p_sent: false, p_error: e instanceof Error ? e.message : String(e) });
          }
        }
        return Response.json({ taken: pending?.length ?? 0, sent, failed });
      },
    },
  },
});
