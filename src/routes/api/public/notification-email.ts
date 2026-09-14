import { createFileRoute } from "@tanstack/react-router";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { EMAIL_LOOKBACK_MS, EMAIL_MAX_ATTEMPTS, processNotificationEmail, type PendingNotification } from "@/lib/notification-email.server";

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// OPS-MON-02 / MON-02: `emailed_at` = provider accepted the send. Failures are persisted
// (email_status / email_attempts / email_next_attempt_at) and retried with bounded backoff.
export const Route = createFileRoute("/api/public/notification-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const provided = request.headers.get("x-hook-secret") ?? "";
        const { data: cfg } = await supabaseAdmin
          .from("email_hook_config" as never)
          .select("secret")
          .maybeSingle<{ secret: string }>();

        if (!cfg?.secret || !timingSafeEqual(provided, cfg.secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const nowIso = new Date().toISOString();
        const since = new Date(Date.now() - EMAIL_LOOKBACK_MS).toISOString();
        const { data: pending, error } = await supabaseAdmin
          .from("notifications")
          .select("id, user_id, kind, payload, created_at, is_test, email_attempts")
          .is("emailed_at", null)
          .gte("created_at", since)
          .lt("email_attempts", EMAIL_MAX_ATTEMPTS)
          .or("email_status.is.null,email_status.eq.failed_transient")
          .or(`email_next_attempt_at.is.null,email_next_attempt_at.lte.${nowIso}`)
          .order("created_at", { ascending: true })
          .limit(50);

        if (error) return new Response(error.message, { status: 500 });

        const counts: Record<string, number> = {};
        for (const row of pending ?? []) {
          const n: PendingNotification = {
            id: row.id as string,
            user_id: row.user_id as string,
            kind: row.kind as string,
            payload: (row.payload ?? {}) as Record<string, unknown>,
            is_test: row.is_test as boolean,
            email_attempts: (row.email_attempts as number) ?? 0,
          };
          const outcome = await processNotificationEmail(n, {
            now: () => new Date(),
            recipientFor: async (userId) => {
              const { data: userRes, error: uErr } = await supabaseAdmin.auth.admin.getUserById(userId);
              if (uErr) throw uErr;
              const u = userRes?.user;
              return u?.email && u.email_confirmed_at ? u.email : null;
            },
            send: async (to, templateData, idempotencyKey) => {
              const r = await sendTemplateEmail("notification", to, { templateData, idempotencyKey });
              return { sent: r.sent };
            },
            update: async (id, patch) => {
              const { error: upErr } = await supabaseAdmin.from("notifications").update(patch as never).eq("id", id);
              if (upErr) console.error("[notification-email] state update failed", id, upErr.message);
            },
            logEvent: async (e) => {
              await (supabaseAdmin.rpc as any)("ops_log_event", {
                p_environment: e.environment,
                p_event_type: e.event_type,
                p_result: e.result,
                p_entity_type: "notification",
                p_entity_id: e.entity_id,
                p_error_code: e.error_code ?? null,
                p_metadata: e.metadata,
              });
            },
          });
          counts[outcome] = (counts[outcome] ?? 0) + 1;
        }

        return Response.json({ processed: pending?.length ?? 0, ...counts });
      },
    },
  },
});
