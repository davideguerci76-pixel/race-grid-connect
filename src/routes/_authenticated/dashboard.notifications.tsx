import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getMyNotifications, markAllNotificationsRead } from "@/lib/paddock.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Pit Call" },
      { name: "description", content: "System alerts and reminders for your motorsport matches, calendar and engagements." },
      { property: "og:title", content: "Notifications — Pit Call" },
      { property: "og:description", content: "System alerts and reminders for your motorsport matches, calendar and engagements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const notifsFn = useServerFn(getMyNotifications);
  const markRead = useServerFn(markAllNotificationsRead);

  const { data: notifications = [] } = useQuery({
    queryKey: ["my-notifications", user?.id],
    enabled: !!user?.id,
    queryFn: () => notifsFn(),
  });

  const unreadCount = (notifications as any[]).filter((n) => !n.read_at).length;

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`notifications-page-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["my-notifications"] });
          qc.invalidateQueries({ queryKey: ["unread-notifications"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="label-mono">[NOTIFICATIONS]</div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-4xl font-black uppercase italic tracking-tighter">Notifications</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/dashboard/engagements"
              className="border border-border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
            >
              Go to engagements
            </Link>
            {unreadCount > 0 && (
              <button
                onClick={() => {
                  markRead()
                    .then(() => {
                      qc.invalidateQueries({ queryKey: ["unread-notifications"] });
                      qc.invalidateQueries({ queryKey: ["my-notifications"] });
                    })
                    .catch(() => {});
                }}
                className="border border-border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
              >
                Mark all as read
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 border border-border bg-card">
          <div className="border-b border-border px-4 py-2">
            <span className="label-mono">[INBOX]{unreadCount > 0 ? ` · ${unreadCount} UNREAD` : ""}</span>
          </div>
          {notifications.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {(notifications as any[]).map((n) => {
                const unread = !n.read_at;
                const isStale = n.kind === "calendar_stale";
                const isEngagement = [
                  "engagement_proposed",
                  "match_taken",
                  "match_reopened",
                  "sos_call",
                  "contact_check",
                  "rating_available",
                  "rating_unlocked",
                ].includes(n.kind);
                return (
                  <li key={n.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${unread ? "bg-racing-red/5" : ""}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {unread && <span className="inline-block h-2 w-2 rounded-full bg-racing-red" />}
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{n.kind}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                      </div>
                      <div className="mt-1 text-sm">
                        {isStale
                          ? "Your availability calendar hasn't been updated in a while. Keep it fresh to rank higher in team searches."
                          : (n.payload?.message ?? n.kind)}
                      </div>
                    </div>
                    {isStale ? (
                      <Link to="/dashboard/calendar" className="border border-racing-yellow bg-racing-yellow/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-racing-yellow hover:brightness-110">
                        Update calendar
                      </Link>
                    ) : isEngagement ? (
                      <Link to="/dashboard/engagements" className="border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-secondary">
                        View engagement
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
