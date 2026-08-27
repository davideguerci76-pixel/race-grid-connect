/**
 * Single source of truth mapping a notification kind + payload to a human
 * title and the in-app destination. Shared by the email dispatcher and the
 * Web Push dispatcher so no delivery channel owns its own business logic.
 */

export type NotificationTarget = {
  title: string;
  path: string;
  label: string;
};

type Payload = Record<string, unknown>;

const BASE: Record<string, NotificationTarget> = {
  new_matches: { title: "New Pit Call match", path: "/dashboard/matches", label: "View matches" },
  revealed_by: { title: "Someone revealed your profile", path: "/dashboard/matches", label: "Open Pit Call" },
  engagement_proposed: { title: "New match proposed", path: "/dashboard/engagements", label: "View engagement" },
  engagement_confirmed: { title: "Match confirmed", path: "/dashboard/engagements", label: "View engagement" },
  engagement_completed: { title: "Engagement completed", path: "/dashboard/engagements", label: "View engagement" },
  engagement_cancelled: { title: "Engagement cancelled", path: "/dashboard/engagements", label: "View engagement" },
  match_taken: { title: "Match taken", path: "/dashboard/engagements", label: "View engagement" },
  match_reopened: { title: "Match reopened", path: "/dashboard/engagements", label: "View engagement" },
  sos_call: { title: "SOS call", path: "/dashboard/engagements", label: "View SOS call" },
  sos_taken: { title: "SOS call taken", path: "/dashboard/engagements", label: "View engagement" },
  contact_check: { title: "Contact check", path: "/dashboard/engagements", label: "View engagement" },
  rating_received: { title: "New rating", path: "/dashboard/engagements", label: "See the rating" },
  rating_available: { title: "Rating available", path: "/dashboard/engagements", label: "Leave your rating" },
  rating_unlocked: { title: "Rating unlocked", path: "/dashboard/engagements", label: "See the rating" },
  calendar_stale: { title: "Quick availability check", path: "/dashboard/calendar", label: "Review availability" },
  team_contact_reminder_1: { title: "Reminder: contact your match", path: "/dashboard/engagements", label: "View engagement" },
  team_contact_reminder_2: { title: "Reminder: contact your match", path: "/dashboard/engagements", label: "View engagement" },
  ghosting_released: { title: "Engagement released", path: "/dashboard/engagements", label: "View engagement" },
  team_ghosted: { title: "No answer from the team", path: "/dashboard/engagements", label: "View engagement" },
  tokens_credited: { title: "Tokens credited", path: "/dashboard/tokens", label: "View balance" },
  request_unfilled: { title: "Pit Call unfilled", path: "/dashboard/requests", label: "Open Pit Call" },
  admin_alert: { title: "Pit Call notice", path: "/dashboard/notifications", label: "Open Pit Call" },
};

const FALLBACK: NotificationTarget = {
  title: "New activity on Pit Call",
  path: "/dashboard/notifications",
  label: "Open Pit Call",
};

/** Resolves the deep-link destination, refining it with payload ids when present. */
export function resolveNotificationTarget(kind: string, payload?: Payload | null): NotificationTarget {
  const base = BASE[kind] ?? FALLBACK;
  const p = (payload ?? {}) as Payload;
  const requestId = typeof p["request_id"] === "string" ? (p["request_id"] as string) : null;

  if (requestId && (kind === "new_matches" || kind === "request_unfilled" || kind === "revealed_by")) {
    return { ...base, path: `/dashboard/requests/${requestId}/matches` };
  }
  return base;
}

/** Short body text for a push notification. */
export function notificationBody(kind: string, payload?: Payload | null): string {
  const p = (payload ?? {}) as Payload;
  const message = p["message"];
  if (typeof message === "string" && message.trim()) return message;
  return resolveNotificationTarget(kind, payload).title;
}
