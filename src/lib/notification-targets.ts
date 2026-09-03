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
  availability_opportunity: { title: "Availability opportunity", path: "/dashboard/calendar", label: "Review availability" },
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

  // Freelancer-only availability alerts never reveal the requesting Team or Pit Call.
  if (kind === "new_matches" && (p["event"] === "hot_partial" || p["event"] === "availability_opportunity")) {
    const month = typeof p["month"] === "string" ? (p["month"] as string) : null;
    const days = Array.isArray(p["relevant_days"]) ? p["relevant_days"].filter((day): day is string => typeof day === "string") : [];
    const search = new URLSearchParams();
    if (month) search.set("m", month);
    if (days.length > 0) search.set("days", days.join(","));
    const query = search.toString();
    return {
      title: p["event"] === "availability_opportunity" ? "Availability opportunity" : "Missing days on your calendar",
      path: query ? `/dashboard/calendar?${query}` : "/dashboard/calendar",
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

  // Engagement-scoped alerts deep-link to the specific card. The id is the
  // stable server-persisted payload value; missing ids fall back to the list.
  const engagementId = typeof p["engagement_id"] === "string" ? (p["engagement_id"] as string) : null;
  if (engagementId && base.path === "/dashboard/engagements") {
    return { ...base, path: `/dashboard/engagements#engagement-${engagementId}` };
  }
  return base;
}

/** Short body text for a push notification. */
export function notificationBody(kind: string, payload?: Payload | null): string {
  const p = (payload ?? {}) as Payload;
  const message = p["message"];
  if (typeof message === "string" && message.trim()) return message;

  if (p["event"] === "availability_opportunity") {
    const count = typeof p["opportunity_count"] === "number" ? p["opportunity_count"] : 1;
    return count > 1
      ? `${count} availability opportunities for you. Check your availability.`
      : "A compatible Pit Call may be possible if you update your availability. Review your calendar.";
  }

  if (p["event"] === "hot_partial") {
    const missing = Array.isArray(p["missing_days"]) ? p["missing_days"].length : 0;
    return missing > 0
      ? `Your calendar is missing ${missing} required day${missing === 1 ? "" : "s"}. Review availability to unlock more opportunities.`
      : "Review your calendar for more opportunities.";
  }

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
