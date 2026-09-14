// OPS-MON-02 / MON-02 — notification e-mail delivery law.
// `emailed_at` is stamped ONLY when the provider accepted the send. Failures are persisted as
// email_status / email_attempts / email_next_attempt_at and retried with bounded backoff.
// Pure logic lives here (dependency-injected) so it can be tested without the provider or the database.
import { EmailAPIError } from "@lovable.dev/email-js";
import { readinessNudgeTarget } from "@/lib/notification-targets";

export const SITE_URL = "https://pitcall.net";
export const EMAIL_MAX_ATTEMPTS = 5;
export const EMAIL_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

export const KIND_META: Record<string, { title: string; path: string; label: string }> = {
  engagement_proposed: { title: "New match proposed", path: "/dashboard/engagements", label: "View engagement" },
  match_taken: { title: "Match taken", path: "/dashboard/engagements", label: "View engagement" },
  match_reopened: { title: "Match reopened", path: "/dashboard/engagements", label: "View engagement" },
  sos_call: { title: "SOS call", path: "/dashboard/engagements", label: "View SOS call" },
  contact_check: { title: "Contact check", path: "/dashboard/engagements", label: "View engagement" },
  rating_available: { title: "Rating available", path: "/dashboard/engagements", label: "Leave your rating" },
  rating_unlocked: { title: "Rating unlocked", path: "/dashboard/engagements", label: "See the rating" },
  calendar_stale: { title: "Quick availability check", path: "/dashboard/calendar", label: "Review availability" },
};

export type EmailFailureClass = "transient" | "permanent" | "suppressed";

/** Provider error → retry class. 4xx (except 408/425/429) = permanent; everything else = transient. */
export function classifyEmailError(e: unknown): { klass: EmailFailureClass; code: string } {
  if (e instanceof EmailAPIError) {
    if (e.code === "recipient_suppressed") return { klass: "suppressed", code: e.code };
    const s = e.status ?? 0;
    if (s >= 400 && s < 500 && ![408, 425, 429].includes(s)) return { klass: "permanent", code: e.code || `http_${s}` };
    return { klass: "transient", code: e.code || (s ? `http_${s}` : "provider_error") };
  }
  const msg = e instanceof Error ? e.message : String(e);
  return { klass: "transient", code: msg.slice(0, 60) || "unknown_error" };
}

/** Backoff: 5 → 10 → 20 → 40 min, capped at 6 h. `attempts` = attempts already made (≥ 1). */
export function nextRetryAt(attempts: number, now: Date): Date {
  const minutes = Math.min(5 * 2 ** Math.max(0, attempts - 1), 360);
  return new Date(now.getTime() + minutes * 60_000);
}

export function resolveMeta(kind: string, payload: Record<string, unknown>) {
  const informational = payload["informational"] === true;
  const sosId = payload["sos_id"];
  if (informational) return { title: "Pit Call update", path: "/dashboard/notifications", label: "Open Pit Call" };
  // UAT-ONBOARD-05: CTA follows the first missing READY cause (role → phone → availability).
  if (kind === "readiness_nudge") return readinessNudgeTarget((payload["primary_reason"] as string | null) ?? null);
  // SOS deep-links to the SOS review page: no engagement exists before acceptance.
  if ((kind === "sos_call" || kind === "sos_taken") && typeof sosId === "string")
    return { title: kind === "sos_call" ? "SOS call" : "SOS call taken", path: `/dashboard/sos/${sosId}`, label: "View SOS call" };
  return KIND_META[kind] ?? { title: "New activity on Pit Call", path: "/dashboard/notifications", label: "Open Pit Call" };
}

export interface PendingNotification {
  id: string;
  user_id: string;
  kind: string;
  payload: Record<string, unknown> | null;
  is_test: boolean;
  email_attempts: number;
}

export interface EmailOutcomeUpdate {
  emailed_at?: string;
  email_status?: "failed_transient" | "failed_permanent" | "suppressed" | "skipped" | null;
  email_attempts?: number;
  email_last_attempt_at?: string;
  email_next_attempt_at?: string | null;
  email_last_error?: string | null;
}

export interface OpsEvent {
  environment: "live" | "test";
  event_type: "NOTIFICATION_EMAIL_SENT" | "NOTIFICATION_EMAIL_FAILED" | "NOTIFICATION_EMAIL_SUPPRESSED";
  result: "SUCCESS" | "FAILED" | "WARN";
  entity_id: string;
  error_code?: string;
  metadata: Record<string, unknown>;
}

export interface ProcessDeps {
  now: () => Date;
  /** Resolves a confirmed e-mail address for the user, or null when the account cannot receive mail. */
  recipientFor: (userId: string) => Promise<string | null>;
  /** Sends through the managed provider. Resolves { sent } or throws (EmailAPIError / network). */
  send: (to: string, templateData: Record<string, unknown>, idempotencyKey: string) => Promise<{ sent: boolean }>;
  /** Persists the outcome on the notification row. */
  update: (id: string, patch: EmailOutcomeUpdate) => Promise<void>;
  /** Appends to the operational event log (best effort — must never throw into the loop). */
  logEvent: (e: OpsEvent) => Promise<void>;
}

export type Outcome = "sent" | "suppressed_test" | "skipped_no_recipient" | "failed_transient" | "failed_permanent" | "recipient_suppressed";

/** Processes one pending row. Never throws; every path persists an observable outcome. */
export async function processNotificationEmail(n: PendingNotification, deps: ProcessDeps): Promise<Outcome> {
  const nowIso = () => deps.now().toISOString();

  // TEST/LIVE email law (F-NUDGE-02): a TEST notification never produces a real email. Fail-closed on anything ≠ false.
  if (n.is_test !== false) {
    await deps.update(n.id, { emailed_at: nowIso(), email_status: "skipped" });
    return "suppressed_test";
  }

  const payload = (n.payload ?? {}) as Record<string, unknown>;
  const meta = resolveMeta(n.kind, payload);
  const attempt = (n.email_attempts ?? 0) + 1;

  let email: string | null = null;
  try {
    email = await deps.recipientFor(n.user_id);
  } catch (e) {
    return await persistFailure(n, attempt, { klass: "transient", code: "recipient_lookup_failed" }, deps);
  }
  if (!email) {
    // No confirmed address: nothing can ever be delivered. Terminal, observable, not an alert-worthy provider failure.
    await deps.update(n.id, { email_status: "skipped", email_attempts: attempt, email_last_attempt_at: nowIso(), email_last_error: "no_confirmed_email", email_next_attempt_at: null });
    return "skipped_no_recipient";
  }

  try {
    const res = await deps.send(email, {
      title: meta.title,
      message: (payload["message"] as string) ?? meta.title,
      actionUrl: `${SITE_URL}${meta.path}`,
      actionLabel: meta.label,
    }, `notification-${n.id}`);
    if (!res.sent) {
      await deps.update(n.id, { email_status: "suppressed", email_attempts: attempt, email_last_attempt_at: nowIso(), email_last_error: "recipient_suppressed", email_next_attempt_at: null });
      await safeLog(deps, { environment: "live", event_type: "NOTIFICATION_EMAIL_SUPPRESSED", result: "WARN", entity_id: n.id, error_code: "recipient_suppressed", metadata: { kind: n.kind, attempt } });
      return "recipient_suppressed";
    }
    // Provider accepted → and only now → emailed_at.
    await deps.update(n.id, { emailed_at: nowIso(), email_status: null, email_attempts: attempt, email_last_attempt_at: nowIso(), email_last_error: null, email_next_attempt_at: null });
    await safeLog(deps, { environment: "live", event_type: "NOTIFICATION_EMAIL_SENT", result: "SUCCESS", entity_id: n.id, metadata: { kind: n.kind, attempt } });
    return "sent";
  } catch (e) {
    return await persistFailure(n, attempt, classifyEmailError(e), deps);
  }
}

async function persistFailure(n: PendingNotification, attempt: number, c: { klass: EmailFailureClass; code: string }, deps: ProcessDeps): Promise<Outcome> {
  const now = deps.now();
  const terminal = c.klass !== "transient" || attempt >= EMAIL_MAX_ATTEMPTS;
  const status = c.klass === "suppressed" ? "suppressed" : terminal ? "failed_permanent" : "failed_transient";
  await deps.update(n.id, {
    email_status: status,
    email_attempts: attempt,
    email_last_attempt_at: now.toISOString(),
    email_last_error: c.code,
    email_next_attempt_at: terminal ? null : nextRetryAt(attempt, now).toISOString(),
  });
  await safeLog(deps, {
    environment: "live",
    event_type: c.klass === "suppressed" ? "NOTIFICATION_EMAIL_SUPPRESSED" : "NOTIFICATION_EMAIL_FAILED",
    result: c.klass === "suppressed" ? "WARN" : "FAILED",
    entity_id: n.id,
    error_code: c.code,
    metadata: { kind: n.kind, attempt, terminal, retry_at: terminal ? null : nextRetryAt(attempt, now).toISOString() },
  });
  return status === "suppressed" ? "recipient_suppressed" : status;
}

async function safeLog(deps: ProcessDeps, e: OpsEvent) {
  try { await deps.logEvent(e); } catch (err) { console.error("[notification-email] ops log failed", err); }
}
