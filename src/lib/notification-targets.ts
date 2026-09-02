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
  engagement_expiring: { title: "Match request expiring", path: "/dashboard/engagements", label: "Confirm now" },
  engagement_expired: { title: "Match request expired", path: "/dashboard/engagements", label: "View engagement" },
  engagement_declined: { title: "Match request declined", path: "/dashboard/engagements", label: "View engagement" },
  engagement_more_time: { title: "Freelancer asked for more time", path: "/dashboard/engagements", label: "View engagement" },
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

/** True when the alert is purely informational and must not link to a Pit Call. */
export function isInformationalNotification(payload?: Payload | null): boolean {
  const p = (payload ?? {}) as Payload;
  return p["informational"] === true;
}

/** Resolves the deep-link destination, refining it with payload ids when present. */
export function resolveNotificationTarget(kind: string, payload?: Payload | null): NotificationTarget {
  const base = BASE[kind] ?? FALLBACK;
  const p = (payload ?? {}) as Payload;
  const requestId = typeof p["request_id"] === "string" ? (p["request_id"] as string) : null;
  const audience = p["audience"] === "team" ? "team" : "freelancer";

  // Team match alerts are actionable for the request owner. They are never
  // informational teasers, so send the team straight to its Match Results.
  if (audience === "team" && requestId && kind === "new_matches") {
    return { ...base, path: `/dashboard/requests/${requestId}/matches` };
  }

  // HOT Partial: the freelancer is only told which of their own days are
  // missing, never which team or Pit Call asked. Destination is the calendar.
  if (kind === "new_matches" && p["event"] === "hot_partial") {
    const month = typeof p["month"] === "string" ? (p["month"] as string) : null;
    return {
      title: "Missing days on your calendar",
      path: month ? `/dashboard/calendar?m=${month}` : "/dashboard/calendar",
      label: "Open calendar",
    };
  }

  // Informational alerts (potential match, Pit Call filled/closed follow-ups)
  // never grant access to the Pit Call: they land on the notification inbox.
  if (isInformationalNotification(p)) {
    return { ...base, path: "/dashboard/notifications", label: FALLBACK.label };
  }

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

  if (p["audience"] === "team" && kind === "new_matches") {
    switch (p["event"]) {
      case "team_first_match": return "A freelancer matches your Pit Call.";
      case "team_first_full": return "Your Pit Call has its first full match.";
      case "team_strong_reached": return "Your Pit Call has reached a strong match result.";
      case "team_match_activity": return "There is new matching activity on your Pit Call.";
      default: return "New matching activity on your Pit Call.";
    }
  }

  return resolveNotificationTarget(kind, payload).title;
}
