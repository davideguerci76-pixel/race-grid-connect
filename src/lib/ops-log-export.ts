// OPS-MON-02 — human-readable TXT rendering of the operational event log (pure, testable).
export interface OpsLogRow {
  occurred_at: string;
  environment: string;
  severity: string;
  event_type: string;
  result: string;
  actor_type: string;
  actor_user_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  secondary_entity_type: string | null;
  secondary_entity_id: string | null;
  reference_id: string | null;
  error_code: string | null;
  metadata: Record<string, unknown> | null;
}

export interface OpsLogExportOptions {
  environment: "live" | "test";
  from: string;
  to: string;
  generatedAt: string;
  generatedBy: string;
  truncated: boolean;
  limit: number;
}

const ts = (s: string) => s.replace("T", " ").replace(/\.\d+/, "").replace(/\+00:00$|Z$/, "Z");
const short = (id: string | null) => (id ? id.slice(0, 8) : "-");

export function renderOpsLogTxt(rows: OpsLogRow[], o: OpsLogExportOptions): string {
  const head = [
    "PITCALL OPERATIONAL EVENT LOG",
    `environment: ${o.environment.toUpperCase()}`,
    `range (UTC): ${ts(o.from)} → ${ts(o.to)}`,
    `generated_at: ${ts(o.generatedAt)}  by admin ${short(o.generatedBy)}`,
    `rows: ${rows.length}${o.truncated ? `  (TRUNCATED at ${o.limit} — narrow the range)` : ""}`,
    "columns: time | sev | event | result | actor | entity | ref | error | metadata",
    "".padEnd(110, "-"),
  ];
  const body = rows.map((r) => {
    const actor = r.actor_type === "system" ? "system" : `${r.actor_type}:${short(r.actor_user_id)}`;
    const entity = r.entity_type ? `${r.entity_type}:${short(r.entity_id)}` : "-";
    const sec = r.secondary_entity_type ? ` ${r.secondary_entity_type}:${short(r.secondary_entity_id)}` : "";
    const meta = r.metadata && Object.keys(r.metadata).length ? JSON.stringify(r.metadata) : "";
    return `${ts(r.occurred_at)} | ${r.severity.padEnd(5)} | ${r.event_type} | ${r.result} | ${actor} | ${entity}${sec} | ${r.reference_id ?? "-"} | ${r.error_code ?? "-"}${meta ? ` | ${meta}` : ""}`;
  });
  return [...head, ...body, "".padEnd(110, "-"), "END OF LOG"].join("\n") + "\n";
}
