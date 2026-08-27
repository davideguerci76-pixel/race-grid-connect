import { createFileRoute } from "@tanstack/react-router";
import { sendWebPush } from "@/lib/web-push.server";
import { notificationBody, resolveNotificationTarget } from "@/lib/notification-targets";

const MAX_ATTEMPTS = 3;
const WINDOW_HOURS = 48;

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Web Push dispatcher — twin of the email dispatcher, driven by the same
 * `notifications` rows. Fan-out is per subscription and recorded in
 * `push_deliveries`, so a device that failed can be retried without the
 * devices that already received the push getting a duplicate.
 *
 * Environment isolation: a notification is only ever paired with subscriptions
 * whose `is_test` matches. A TEST push can never reach a LIVE device.
 */
export const Route = createFileRoute("/api/public/notification-push")({
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

        const vapid = {
          publicKey: process.env["VAPID_PUBLIC_KEY"] ?? "",
          privateKey: process.env["VAPID_PRIVATE_KEY"] ?? "",
          subject: process.env["VAPID_SUBJECT"] ?? "mailto:privacy@pitcall.net",
        };
        if (!vapid.publicKey || !vapid.privateKey) {
          return new Response("Push keys are not configured", { status: 500 });
        }

        const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();

        // 1) Fan out: create one delivery row per (notification, subscription).
        const { data: fresh } = await supabaseAdmin
          .from("notifications")
          .select("id, user_id, kind, payload, is_test, created_at")
          .is("pushed_at", null)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(100);

        // Subscriptions are loaded once for the whole batch: a per-notification
        // query made every run cost one round trip per undeliverable backlog row
        // (test notifications with no device keep pushed_at NULL forever), which
        // pushed the whole request past the pg_net timeout and stalled all pushes.
        const userIds = [...new Set((fresh ?? []).map((n) => n.user_id as string))];
        const subsByKey = new Map<string, string[]>();
        if (userIds.length) {
          const { data: allSubs } = await supabaseAdmin
            .from("push_subscriptions")
            .select("id, user_id, is_test")
            .in("user_id", userIds);
          for (const s of allSubs ?? []) {
            const key = `${s.user_id as string}:${s.is_test as boolean}`;
            subsByKey.set(key, [...(subsByKey.get(key) ?? []), s.id as string]);
          }
        }

        const deliveryRows: Array<{ notification_id: string; subscription_id: string; is_test: boolean; status: string }> = [];
        const pushedIds: string[] = [];
        for (const n of fresh ?? []) {
          const subIds = subsByKey.get(`${n.user_id as string}:${n.is_test as boolean}`) ?? [];
          if (!subIds.length) continue;
          for (const sid of subIds) {
            deliveryRows.push({
              notification_id: n.id as string,
              subscription_id: sid,
              is_test: n.is_test as boolean,
              status: "pending",
            });
          }
          // Only mark as pushed once at least one delivery row exists, so a
          // notification created while the user had no active subscription
          // is still delivered when they re-subscribe within the window.
          pushedIds.push(n.id as string);
        }

        if (deliveryRows.length) {
          await supabaseAdmin
            .from("push_deliveries")
            .upsert(deliveryRows, { onConflict: "notification_id,subscription_id", ignoreDuplicates: true });
          await supabaseAdmin
            .from("notifications")
            .update({ pushed_at: new Date().toISOString() })
            .in("id", pushedIds);
        }


        // 2) Deliver everything still pending or retryable.
        const { data: pending, error } = await supabaseAdmin
          .from("push_deliveries")
          .select("id, notification_id, subscription_id, attempts, status")
          .in("status", ["pending", "failed"])
          .lt("attempts", MAX_ATTEMPTS)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(200);
        if (error) return new Response(error.message, { status: 500 });

        let sent = 0;
        let failed = 0;
        let gone = 0;

        for (const d of pending ?? []) {
          const [{ data: notif }, { data: sub }] = await Promise.all([
            supabaseAdmin
              .from("notifications")
              .select("id, user_id, kind, payload, is_test")
              .eq("id", d.notification_id as string)
              .maybeSingle(),
            supabaseAdmin
              .from("push_subscriptions")
              .select("id, endpoint, p256dh, auth, user_id, is_test")
              .eq("id", d.subscription_id as string)
              .maybeSingle(),
          ]);

          if (!notif || !sub) {
            await supabaseAdmin.from("push_deliveries").update({ status: "gone", last_attempt_at: new Date().toISOString() }).eq("id", d.id as string);
            continue;
          }

          // Hard environment guard — belt and braces on top of the fan-out filter.
          if (notif.is_test !== sub.is_test || notif.user_id !== sub.user_id) {
            await supabaseAdmin
              .from("push_deliveries")
              .update({ status: "gone", last_error: "environment mismatch", last_attempt_at: new Date().toISOString() })
              .eq("id", d.id as string);
            continue;
          }

          const payload = (notif.payload ?? {}) as Record<string, unknown>;
          const target = resolveNotificationTarget(notif.kind as string, payload);

          const { count: unread } = await supabaseAdmin
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", notif.user_id as string)
            .eq("is_test", notif.is_test as boolean)
            .is("read_at", null);

          const result = await sendWebPush(
            { endpoint: sub.endpoint as string, p256dh: sub.p256dh as string, auth: sub.auth as string },
            {
              title: notif.is_test ? `[TEST] ${target.title}` : target.title,
              body: notificationBody(notif.kind as string, payload),
              url: target.path,
              tag: notif.kind as string,
              env: notif.is_test ? "test" : "live",
              unread: unread ?? 0,
            },
            vapid,
          );

          const now = new Date().toISOString();
          if (result.ok) {
            sent++;
            await supabaseAdmin
              .from("push_deliveries")
              .update({ status: "sent", attempts: (d.attempts as number) + 1, last_attempt_at: now, last_error: null })
              .eq("id", d.id as string);
          } else if (result.gone) {
            gone++;
            await supabaseAdmin
              .from("push_deliveries")
              .update({ status: "gone", attempts: (d.attempts as number) + 1, last_attempt_at: now, last_error: result.error })
              .eq("id", d.id as string);
            // Dead endpoint: drop the subscription so we stop trying.
            await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id as string);
          } else {
            failed++;
            await supabaseAdmin
              .from("push_deliveries")
              .update({ status: "failed", attempts: (d.attempts as number) + 1, last_attempt_at: now, last_error: `${result.status}: ${result.error}` })
              .eq("id", d.id as string);
          }
        }

        // 3) Retention: keep the ledger small.
        await Promise.resolve(supabaseAdmin.rpc("cleanup_push_deliveries")).catch(() => undefined);

        return new Response(JSON.stringify({ sent, failed, gone }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
