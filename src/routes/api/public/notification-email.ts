import { createFileRoute } from "@tanstack/react-router";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

const SITE_URL = "https://pitcall.net";

const KIND_META: Record<string, { title: string; path: string; label: string }> = {
  engagement_proposed: { title: "New match proposed", path: "/dashboard/engagements", label: "View engagement" },
  match_taken: { title: "Match taken", path: "/dashboard/engagements", label: "View engagement" },
  match_reopened: { title: "Match reopened", path: "/dashboard/engagements", label: "View engagement" },
  sos_call: { title: "SOS call", path: "/dashboard/engagements", label: "View SOS call" },
  contact_check: { title: "Contact check", path: "/dashboard/engagements", label: "View engagement" },
  rating_available: { title: "Rating available", path: "/dashboard/engagements", label: "Leave your rating" },
  rating_unlocked: { title: "Rating unlocked", path: "/dashboard/engagements", label: "See the rating" },
  calendar_stale: { title: "Quick availability check", path: "/dashboard/calendar", label: "Review availability" },
};

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

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

        const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const { data: pending, error } = await supabaseAdmin
          .from("notifications")
          .select("id, user_id, kind, payload, created_at")
          .is("emailed_at", null)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(50);

        if (error) return new Response(error.message, { status: 500 });

        let sent = 0;
        for (const n of pending ?? []) {
          const meta = KIND_META[n.kind as string] ?? {
            title: "New activity on Pit Call",
            path: "/dashboard/notifications",
            label: "Open Pit Call",
          };
          try {
            const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(n.user_id as string);
            const email = userRes?.user?.email;
            if (email && userRes?.user?.email_confirmed_at) {
              const payload = (n.payload ?? {}) as Record<string, unknown>;
              await sendTemplateEmail("notification", email, {
                templateData: {
                  title: meta.title,
                  message: (payload["message"] as string) ?? meta.title,
                  actionUrl: `${SITE_URL}${meta.path}`,
                  actionLabel: meta.label,
                },
                idempotencyKey: `notification-${n.id}`,
              });
              sent++;
            }
          } catch (e) {
            console.error("[notification-email] send failed", n.id, e);
          }
          await supabaseAdmin
            .from("notifications")
            .update({ emailed_at: new Date().toISOString() } as never)
            .eq("id", n.id as string);
        }

        return Response.json({ processed: pending?.length ?? 0, sent });
      },
    },
  },
});
