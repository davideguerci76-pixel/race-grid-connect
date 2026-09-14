import { describe, expect, test } from "bun:test";
import { EmailAPIError } from "@lovable.dev/email-js";
import { classifyEmailError, nextRetryAt, processNotificationEmail, type EmailOutcomeUpdate, type OpsEvent, type PendingNotification } from "./notification-email.server";
import { renderOpsLogTxt } from "./ops-log-export";
import { describeOpsAlert } from "./ops-alert-format";

function harness(opts: { recipient?: string | null; send?: () => Promise<{ sent: boolean }> }) {
  const updates: EmailOutcomeUpdate[] = [];
  const events: OpsEvent[] = [];
  let sends = 0;
  const deps = {
    now: () => new Date("2026-09-15T10:00:00Z"),
    recipientFor: async () => (opts.recipient === undefined ? "a@b.c" : opts.recipient),
    send: async () => { sends++; return opts.send ? await opts.send() : { sent: true }; },
    update: async (_id: string, p: EmailOutcomeUpdate) => { updates.push(p); },
    logEvent: async (e: OpsEvent) => { events.push(e); },
  };
  return { deps, updates, events, sends: () => sends };
}
const row = (over: Partial<PendingNotification> = {}): PendingNotification => ({ id: "n1", user_id: "u1", kind: "match_taken", payload: {}, is_test: false, email_attempts: 0, ...over });
const apiErr = (status: number, code = "x") => Object.assign(new EmailAPIError(code, status, "m"), { code, status });

describe("MON-02 e-mail delivery law", () => {
  test("TEST row never sends, is consumed once", async () => {
    const h = harness({});
    expect(await processNotificationEmail(row({ is_test: true }), h.deps)).toBe("suppressed_test");
    expect(h.sends()).toBe(0);
    expect(h.updates[0]!.emailed_at).toBeTruthy();
  });
  test("success stamps emailed_at and logs SENT", async () => {
    const h = harness({});
    expect(await processNotificationEmail(row(), h.deps)).toBe("sent");
    expect(h.updates[0]!.emailed_at).toBeTruthy();
    expect(h.updates[0]!.email_attempts).toBe(1);
    expect(h.events[0]!.event_type).toBe("NOTIFICATION_EMAIL_SENT");
  });
  test("transient provider error: NO emailed_at, retry scheduled, FAILED logged", async () => {
    const h = harness({ send: async () => { throw apiErr(503, "upstream"); } });
    expect(await processNotificationEmail(row(), h.deps)).toBe("failed_transient");
    const u = h.updates[0]!;
    expect(u.emailed_at).toBeUndefined();
    expect(u.email_status).toBe("failed_transient");
    expect(u.email_next_attempt_at).toBe("2026-09-15T10:05:00.000Z");
    expect(h.events[0]!.result).toBe("FAILED");
  });
  test("network error is transient", async () => {
    const h = harness({ send: async () => { throw new Error("fetch failed"); } });
    expect(await processNotificationEmail(row(), h.deps)).toBe("failed_transient");
  });
  test("4xx is permanent, no retry", async () => {
    const h = harness({ send: async () => { throw apiErr(422, "invalid_payload"); } });
    expect(await processNotificationEmail(row(), h.deps)).toBe("failed_permanent");
    expect(h.updates[0]!.email_next_attempt_at).toBeNull();
  });
  test("429 is transient", () => { expect(classifyEmailError(apiErr(429)).klass).toBe("transient"); });
  test("5th transient attempt becomes permanent", async () => {
    const h = harness({ send: async () => { throw apiErr(500); } });
    expect(await processNotificationEmail(row({ email_attempts: 4 }), h.deps)).toBe("failed_permanent");
    expect(h.updates[0]!.email_attempts).toBe(5);
  });
  test("suppressed recipient is terminal WARN, no emailed_at", async () => {
    const h = harness({ send: async () => ({ sent: false }) });
    expect(await processNotificationEmail(row(), h.deps)).toBe("recipient_suppressed");
    expect(h.updates[0]!.emailed_at).toBeUndefined();
    expect(h.events[0]!.event_type).toBe("NOTIFICATION_EMAIL_SUPPRESSED");
  });
  test("no confirmed e-mail → skipped, no send, no retry", async () => {
    const h = harness({ recipient: null });
    expect(await processNotificationEmail(row(), h.deps)).toBe("skipped_no_recipient");
    expect(h.sends()).toBe(0);
    expect(h.updates[0]!.email_status).toBe("skipped");
  });
  test("backoff doubles and caps at 6h", () => {
    const t = new Date("2026-01-01T00:00:00Z");
    expect(nextRetryAt(1, t).toISOString()).toBe("2026-01-01T00:05:00.000Z");
    expect(nextRetryAt(3, t).toISOString()).toBe("2026-01-01T00:20:00.000Z");
    expect(nextRetryAt(20, t).toISOString()).toBe("2026-01-01T06:00:00.000Z");
  });
  test("ops log failure never breaks delivery", async () => {
    const h = harness({});
    h.deps.logEvent = async () => { throw new Error("log down"); };
    expect(await processNotificationEmail(row(), h.deps)).toBe("sent");
  });
});

describe("Operational exports", () => {
  test("TXT rendering is readable and complete", () => {
    const txt = renderOpsLogTxt([
      { occurred_at: "2026-09-15T10:00:00.123+00:00", environment: "live", severity: "INFO", event_type: "PITCALL_CREATED", result: "SUCCESS", actor_type: "user", actor_user_id: "11111111-2222", entity_type: "request", entity_id: "aaaaaaaa-bbbb", secondary_entity_type: null, secondary_entity_id: null, reference_id: "PIT-1", error_code: null, metadata: { tokens: 3 } },
    ], { environment: "live", from: "2026-09-08T00:00:00Z", to: "2026-09-15T23:59:59Z", generatedAt: "2026-09-15T12:00:00Z", generatedBy: "99999999-x", truncated: false, limit: 20000 });
    expect(txt).toContain("PITCALL OPERATIONAL EVENT LOG");
    expect(txt).toContain("environment: LIVE");
    expect(txt).toContain("2026-09-15 10:00:00Z | INFO  | PITCALL_CREATED | SUCCESS | user:11111111 | request:aaaaaaaa | PIT-1 | - | {\"tokens\":3}");
    expect(txt.trim().endsWith("END OF LOG")).toBe(true);
  });
  test("alert description per check kind", () => {
    const d = describeOpsAlert({ alert_key: "cron:x", check_kind: "cron_health", notify_kind: "open", opened_at: "2026-09-15T10:00:00Z", payload: { job: "x", expected_interval_min: 1, last_success_at: "2026-09-15T09:00:00Z", detected_at: "2026-09-15T10:00:00Z" } });
    expect(d.summary).toContain('"x"');
    expect(d.detectedAt).toBe("2026-09-15 10:00:00");
    const r = describeOpsAlert({ alert_key: "email:notification_delivery", check_kind: "email_delivery", notify_kind: "recovered", opened_at: "2026-09-15T10:00:00Z", recovered_at: "2026-09-15T11:00:00Z", payload: { permanent_failures_24h: 0 } });
    expect(r.summary.startsWith("Recovered:")).toBe(true);
    expect(r.detectedAt).toBe("2026-09-15 11:00:00");
  });
});
