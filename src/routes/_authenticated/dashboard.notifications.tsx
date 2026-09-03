import { notificationKindLabel } from "@/lib/labels";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/paddock.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { BackButton } from "@/components/back-button";
import { useDateFormat } from "@/lib/date-locale";
import { PushSetupCard } from "@/components/push-setup-card";
import { useAppBadge } from "@/hooks/use-push-notifications";
import { formatCriterion } from "@/lib/criteria-label";


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
  const { t } = useTranslation();
  const { formatDateTime } = useDateFormat();
  const { user } = useAuth();
  const qc = useQueryClient();
  const notifsFn = useServerFn(getMyNotifications);
  const markRead = useServerFn(markAllNotificationsRead);
  const markOneRead = useServerFn(markNotificationRead);

  const { data: notifications = [] } = useQuery({
    queryKey: ["my-notifications", user?.id],
    enabled: !!user?.id,
    queryFn: () => notifsFn(),
  });

  const unreadCount = (notifications as any[]).filter((n) => !n.read_at).length;

  // Keep the installed-app icon badge in sync with the unread count.
  useAppBadge(unreadCount);


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
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page py-12">
        <div className="label-mono">[NOTIFICATIONS]</div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("sweep_profile.notifications.title")}</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/dashboard/engagements"
              className="border border-border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
            >
              {t("sweep_profile.notifications.go_to_engagements")}
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
                {t("sweep_profile.notifications.mark_all_read")}
              </button>
            )}
          </div>
        </div>

        <PushSetupCard />

        <div className="mt-6 border border-border bg-card">

          <div className="border-b border-border px-4 py-2">
            <span className="label-mono">[INBOX]{unreadCount > 0 ? ` · ${unreadCount} ${t("sweep_profile.notifications.unread")}` : ""}</span>
          </div>
          {notifications.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">{t("sweep_profile.notifications.no_notifications")}</div>
          ) : (
            <ul className="divide-y divide-border">
              {(notifications as any[]).map((n) => {
                const unread = !n.read_at;
                const isStale = n.kind === "calendar_stale";
                const isAvailabilityOpportunity = n.kind === "new_matches" && n.payload?.event === "availability_opportunity";
                const isTeamMatch = n.kind === "new_matches" && n.payload?.audience === "team";
                const info = !isTeamMatch && n.payload?.informational === true;
                // Stable object id persisted server-side. Never inferred from text.
                const engagementId = typeof n.payload?.engagement_id === "string" ? n.payload.engagement_id : null;
                const isEngagement = !info && !isTeamMatch && (!!engagementId || [
                  "engagement_proposed",
                  "match_taken",
                  "match_reopened",
                  "sos_call",
                  "contact_check",
                  "rating_available",
                  "rating_unlocked",
                ].includes(n.kind));
                const markClicked = () => {
                  if (n.read_at) return;
                  void markOneRead({ data: { id: n.id } }).then(() => {
                    qc.invalidateQueries({ queryKey: ["unread-notifications"] });
                    qc.invalidateQueries({ queryKey: ["my-notifications"] });
                  }).catch(() => {});
                };
                const teamEvent = n.payload?.event as string | undefined;
                return (
                  <li
                    key={n.id}
                    onClick={markClicked}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") markClicked(); }}
                    role="button"
                    tabIndex={0}
                    className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${unread ? "bg-racing-red/5" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {unread && <span className="inline-block h-2 w-2 rounded-full bg-racing-red" />}
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{notificationKindLabel(n.kind)}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{formatDateTime(n.created_at)}</span>
                      </div>
                      <div className="mt-1 text-sm">
                        {isTeamMatch ? (
                          <TeamMatchMessage event={teamEvent} t={t} />
                        ) : isStale ? (
                          n.payload?.state === "unconfirmed"
                            ? t("sweep_profile.notifications.calendar_stale_unconfirmed_message")
                            : t("sweep_profile.notifications.calendar_stale_message")
                        ) : info ? (
                          <InformationalMessage payload={n.payload} kind={n.kind} />
                        ) : (
                          n.payload?.message ?? notificationKindLabel(n.kind)
                        )}
                      </div>
                    </div>
                    {isStale ? (
                      <Link onClick={markClicked} to="/dashboard/calendar" className="border border-racing-yellow bg-racing-yellow/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-racing-yellow hover:brightness-110">
                        {t("sweep_profile.notifications.update_calendar")}
                      </Link>
                    ) : isTeamMatch && n.payload?.request_id ? (
                      <Link
                        onClick={markClicked}
                        to="/dashboard/requests/$id/matches"
                        params={{ id: String(n.payload.request_id) }}
                        className="border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
                      >
                        {t("sweep_profile.notifications.view_matches")}
                      </Link>
                    ) : n.payload?.event === "hot_partial" || isAvailabilityOpportunity ? (
                      <Link
                        onClick={markClicked}
                        to="/dashboard/calendar"
                        search={{
                          m: String(n.payload?.month ?? ""),
                          days: Array.isArray(n.payload?.missing_days)
                            ? n.payload.missing_days.join(",")
                            : Array.isArray(n.payload?.relevant_days)
                              ? n.payload.relevant_days.join(",")
                              : undefined,
                        }}
                        className="border border-racing-yellow bg-racing-yellow/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-racing-yellow hover:brightness-110"
                      >
                        {t("sweep_profile.notifications.update_calendar")}
                      </Link>
                    ) : isEngagement ? (
                      <Link
                        onClick={markClicked}
                        to="/dashboard/engagements"
                        hash={engagementId ? `engagement-${engagementId}` : undefined}
                        className="border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
                      >
                        {t("sweep_profile.notifications.view_engagement")}
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

/**
 * Renders the three informational freelancer alerts. These never link to the
 * Pit Call: a potential match is information, not access.
 */
function TeamMatchMessage({ event, t }: { event?: string; t: (key: string) => string }) {
  const key = event === "team_first_match"
    ? "sweep_profile.notifications.team_first_match"
    : event === "team_first_full"
      ? "sweep_profile.notifications.team_first_full"
      : event === "team_strong_reached"
        ? "sweep_profile.notifications.team_strong_reached"
        : "sweep_profile.notifications.team_match_activity";
  return <span>{t(key)}</span>;
}

function InformationalMessage({ payload, kind }: { payload: any; kind: string }) {
  const { t } = useTranslation();
  if (payload?.event === "availability_opportunity") {
    return (
      <div className="grid gap-1">
        <div className="font-medium">{t("sweep_profile.notifications.availability_opportunity_title")}</div>
        <div className="text-muted-foreground">{t("sweep_profile.notifications.availability_opportunity_body")}</div>
      </div>
    );
  }

  if (payload?.event === "hot_partial") {
    const days = Array.isArray(payload?.missing_days) ? payload.missing_days : [];
    return (
      <div className="grid gap-1">
        <div className="font-medium">{t("sweep_profile.notifications.hot_partial_title")}</div>
        <div className="text-muted-foreground">
          {t("sweep_profile.notifications.hot_partial_body", { count: days.length })}
        </div>
        {days.length > 0 && <div className="font-mono text-xs text-racing-yellow">{days.join(" · ")}</div>}
      </div>
    );
  }
  const outcome = payload?.outcome as string | undefined;
  const score = Math.round(Number(payload?.score ?? 0));
  const criteria = Array.isArray(payload?.criteria) ? payload.criteria : [];

  if (outcome === "filled" || kind === "match_taken") {
    const perfect = score >= 100;
    return (
      <div className="grid gap-1">
        <div className="font-medium">{t("pmatch.filled_title")}</div>
        {perfect ? (
          <>
            <div>{t("pmatch.filled_perfect")}</div>
            <div className="text-muted-foreground">{t("pmatch.filled_perfect_tip")}</div>
          </>
        ) : (
          <>
            <div>{t("pmatch.filled_score", { score })}</div>
            {criteria.length > 0 && (
              <>
                <div>{t("pmatch.filled_criteria_intro")}</div>
                <ul className="ml-4 list-disc text-muted-foreground">
                  {criteria.map((c: any, i: number) => (
                    <li key={i}>{formatCriterion(c, t)}</li>
                  ))}
                </ul>
              </>
            )}
            <div className="text-muted-foreground">{t("pmatch.filled_tip")}</div>
          </>
        )}
      </div>
    );
  }

  if (outcome === "closed" || kind === "request_unfilled") {
    return (
      <div className="grid gap-1">
        <div className="font-medium">{t("pmatch.closed_title")}</div>
        <div className="text-muted-foreground">{t("pmatch.closed_body")}</div>
      </div>
    );
  }

  return (
    <div className="grid gap-1">
      <div className="font-medium">{t("pmatch.potential_title")}</div>
      <div className="text-muted-foreground">{t("pmatch.potential_body")}</div>
    </div>
  );
}
