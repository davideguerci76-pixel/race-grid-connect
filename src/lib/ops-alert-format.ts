// OPS-MON-02 — pure formatting of an ops_alert_state row into e-mail template data (testable, no I/O).
export interface OpsAlertRow {
  alert_key: string;
  check_kind: string;
  notify_kind: "open" | "reminder" | "recovered" | null;
  opened_at: string;
  recovered_at?: string | null;
  payload: Record<string, unknown> | null;
}

const fmt = (v: unknown) =>
  typeof v === "string" ? v.replace("T", " ").replace(/(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, "") : String(v ?? "—");

export function describeOpsAlert(a: OpsAlertRow) {
  const p = a.payload ?? {};
  const kind = a.notify_kind ?? "open";
  let summary: string;
  switch (a.check_kind) {
    case "cron_health":
      summary = `Scheduled job "${p["job"] ?? a.alert_key}" has not completed successfully within 2× its expected interval (${p["expected_interval_min"] ?? "?"} min). Last success: ${fmt(p["last_success_at"])}.`;
      break;
    case "pgnet_health":
      summary = `Internal endpoint calls (pg_net → /api/public/*) failed ${p["consecutive_failures"] ?? "≥3"} times in a row. Last error: ${p["last_error"] ?? "—"}.`;
      break;
    case "email_delivery":
      summary = `Notification e-mail delivery is failing: ${p["permanent_failures_24h"] ?? 0} permanent and ${p["transient_failures_24h"] ?? 0} transient failures in the last 24 h.`;
      break;
    case "token_ledger":
      summary = `New LIVE token balance ≠ ledger mismatch for user ${p["user_id"] ?? "?"}: balance ${p["token_balance"]}, ledger ${p["ledger_sum"]} (diff ${p["difference"]}). Not auto-corrected.`;
      break;
    case "capacity_self_check":
      summary = `The daily capacity check has not run for more than ${p["threshold_hours"] ?? 36} h (last: ${fmt(p["last_checked_at"])}).`;
      break;
    default:
      summary = `Operational check "${a.check_kind}" reported a problem.`;
  }
  if (kind === "recovered") summary = `Recovered: ${summary}`;
  const details = Object.entries(p).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : fmt(v)}`).join("\n");
  return {
    kind,
    checkKind: a.check_kind,
    alertKey: a.alert_key,
    detectedAt: fmt(kind === "recovered" ? a.recovered_at : (p["detected_at"] ?? a.opened_at)),
    summary,
    details,
  };
}
