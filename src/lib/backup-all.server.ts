// OPS-BR-01B — BACKUP ALL (LIVE) v1 — plaintext package builder + validation.
// READ-ONLY with respect to business data. Never writes to the database.
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { sha256Hex } from "@/lib/backup-crypto.server";

export const BACKUP_FORMAT = "PITCALL_BACKUP";
export const BACKUP_FORMAT_VERSION = 1;

export const ESSENTIAL_DATASETS = [
  "profiles", "freelancer_profiles", "team_profiles", "freelancer_contacts", "user_roles", "billing_details", "legal_acceptances",
  "availability", "user_calendars", "calendar_day_notes",
  "requests", "engagements",
  "ratings", "rating_bonus_grants",
  "token_transactions", "token_orders", "token_order_events",
  "platform_settings", "matching_weights", "token_packages",
  "taxonomy_disciplines", "taxonomy_languages", "taxonomy_role_groups", "taxonomy_sub_roles", "taxonomy_skills", "taxonomy_skill_role_groups",
  "admin_emails",
] as const;

export const USEFUL_DATASETS = [
  "matches", "match_history", "team_pool", "match_unlocks", "request_tier_unlocks", "pool_search_unlocks", "review_unlocks",
  "team_reveals", "request_team_reveals", "sos_calls", "sos_call_targets", "rating_flags", "admin_audit_log", "notifications",
] as const;

export const EXCLUDED_DATASETS = [
  "availability_recompute_queue", "availability_opportunity_state", "hot_partial_state", "team_match_notification_state",
  "platform_capacity_state", "push_deliveries", "push_subscriptions", "client_error_log", "demo_seed_state", "admin_env_state",
  "admin_time_settings", "request_recheck_ledger", "email_hook_config",
];

export const SNAPSHOT_LIMITATIONS = [
  "No passwords or password hashes (auth.users credentials are never exported).",
  "No complete Auth configuration (providers, email templates, JWT settings, redirect URLs).",
  "No secrets or environment variables (service role key, API keys, Stripe, VAPID private key, email hook secret, Lovable API key, Google Maps key).",
  "No DNS / custom domain configuration.",
  "No external Stripe configuration (products, prices, webhooks).",
  "No provider PITR / backup retention settings.",
  "No deployment infrastructure (hosting, edge runtime, build pipeline).",
  "The managed auth/storage/realtime schemas are not duplicated; only application triggers on auth.* are listed.",
];

type Json = Record<string, unknown>;

const SECRET_MARKERS = ["sb_secret_", "sk_live_", "sk_test_", "rk_live_", "whsec_", "-----BEGIN PRIVATE", "-----BEGIN RSA", "eyJhbGciOi"];

function envSecretValues(): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(process.env)) {
    if (!v || v.length < 16) continue;
    if (/(KEY|SECRET|TOKEN|PASSWORD|PRIVATE)/i.test(k) && !/^VITE_/.test(k) && !/URL|PROJECT_ID|PUBLISHABLE|ANON/i.test(k)) out.push(v);
  }
  return out;
}

export class BackupValidationError extends Error {
  constructor(public code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export type BuildResult = {
  zip: Uint8Array;
  manifest: Json;
  timings: { export_ms: number; auth_ms: number; build_ms: number };
  plaintextBytes: number;
};

async function authMapping(supabaseAdmin: any, liveIds: Set<string>) {
  const rows: Json[] = [];
  let excluded = 0;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`AUTH_LIST_FAILED: ${error.message}`);
    for (const u of data?.users ?? []) {
      if (!liveIds.has(u.id)) { excluded++; continue; }
      rows.push({
        id: u.id,
        email: u.email ?? null,
        email_confirmed_at: u.email_confirmed_at ?? null,
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        providers: (u.identities ?? []).map((i: any) => i.provider),
        app_metadata_provider: u.app_metadata?.provider ?? null,
      });
    }
    if ((data?.users?.length ?? 0) < 1000) break;
  }
  return { rows, excluded };
}

function policySql(p: any): string {
  const roles = Array.isArray(p.roles) ? p.roles.join(", ") : String(p.roles ?? "public").replace(/[{}]/g, "");
  let s = `CREATE POLICY ${q(p.name)} ON public.${q(p.table)} AS ${p.permissive} FOR ${p.command} TO ${roles}`;
  if (p.using) s += ` USING (${p.using})`;
  if (p.with_check) s += ` WITH CHECK (${p.with_check})`;
  return s + ";";
}
function q(id: string) { return `"${String(id).replace(/"/g, '""')}"`; }

/**
 * Builds the plaintext ZIP package for a LIVE backup. Throws BackupValidationError when an
 * ESSENTIAL check fails — in that case nothing must be encrypted or delivered.
 */
export async function buildLiveBackup(adminId: string, backupPassword: string): Promise<BuildResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const t0 = Date.now();
  // One SQL statement → business data and architecture come from one statement-level snapshot.
  const { data, error } = await (supabaseAdmin.rpc as any)("backup_all_live_export");
  if (error) throw new Error(`EXPORT_FAILED: ${error.message}`);
  const exportMs = Date.now() - t0;
  const business = (data?.business ?? {}) as Record<string, Json[]>;
  const architecture = (data?.architecture ?? {}) as Json;
  if (!data?.snapshot_time || !business || !architecture) throw new BackupValidationError("EXPORT_SHAPE_INVALID");

  const t1 = Date.now();
  const liveIds = new Set<string>((business.profiles ?? []).map((p) => String(p.id)));
  for (const r of business.user_roles ?? []) liveIds.add(String(r.user_id));
  const auth = await authMapping(supabaseAdmin, liveIds);
  const authMs = Date.now() - t1;

  const t2 = Date.now();
  // ---------- PRE-ENCRYPTION VALIDATION ----------
  for (const name of ESSENTIAL_DATASETS) {
    if (!Array.isArray(business[name])) throw new BackupValidationError("ESSENTIAL_DATASET_MISSING", name);
  }
  if (!Array.isArray(business.token_transactions)) throw new BackupValidationError("TOKEN_LEDGER_MISSING");
  if (!Array.isArray(business.rating_bonus_grants)) throw new BackupValidationError("RATING_BONUS_GRANTS_MISSING");
  for (const [name, rows] of Object.entries(business)) {
    for (const r of rows) if ((r as any).is_test === true) throw new BackupValidationError("TEST_ROW_IN_LIVE_BACKUP", name);
  }
  for (const key of ["tables", "columns", "constraints", "indexes", "functions", "triggers", "policies", "enums", "cron_jobs", "migration_state"]) {
    if (!(key in architecture)) throw new BackupValidationError("ARCHITECTURE_SECTION_MISSING", key);
  }
  for (const r of auth.rows) {
    for (const k of Object.keys(r)) if (/password|hash|token|secret|session/i.test(k)) throw new BackupValidationError("AUTH_MAPPING_UNSAFE_FIELD", k);
  }
  // Cross-check row counts against a second read (detects writes during the export window).
  const recount: Record<string, { exported: number; recount: number }> = {};
  for (const tbl of ["profiles", "requests", "engagements", "token_transactions", "ratings", "availability"]) {
    const { count } = await (supabaseAdmin as any).from(tbl).select("*", { count: "exact", head: true }).eq("is_test", false);
    recount[tbl] = { exported: business[tbl].length, recount: count ?? -1 };
  }
  const recountDrift = Object.entries(recount).filter(([, v]) => v.exported !== v.recount).map(([k]) => k);

  // FK / UUID preservation (report orphans; never mutate).
  const profileIds = new Set((business.profiles ?? []).map((p) => String(p.id)));
  const requestIds = new Set((business.requests ?? []).map((p) => String(p.id)));
  const engagementIds = new Set((business.engagements ?? []).map((p) => String(p.id)));
  const orphan = (rows: Json[], col: string, set: Set<string>) => rows.filter((r) => r[col] != null && !set.has(String(r[col]))).length;
  const integrity = {
    engagements_freelancer_not_in_profiles: orphan(business.engagements, "freelancer_id", profileIds),
    engagements_team_not_in_profiles: orphan(business.engagements, "team_id", profileIds),
    engagements_request_not_in_requests: orphan(business.engagements, "request_id", requestIds),
    requests_team_not_in_profiles: orphan(business.requests, "team_id", profileIds),
    token_transactions_user_not_in_profiles: orphan(business.token_transactions, "user_id", profileIds),
    ratings_engagement_not_in_engagements: orphan(business.ratings, "engagement_id", engagementIds),
    rating_bonus_grants_engagement_not_in_engagements: orphan(business.rating_bonus_grants, "engagement_id", engagementIds),
    availability_freelancer_not_in_profiles: orphan(business.availability, "freelancer_id", profileIds),
    auth_users_without_live_profile_excluded: auth.excluded,
    live_profiles_without_auth_user: [...profileIds].filter((id) => !auth.rows.some((u) => u.id === id)).length,
  };
  // Relational UUID keys must survive serialization verbatim (taxonomy/config tables may use integer ids).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const name of ["profiles", "requests", "engagements", "ratings", "token_transactions", "token_orders", "matches", "sos_calls"]) {
    for (const r of business[name] ?? []) {
      if (typeof r.id !== "string" || !UUID_RE.test(r.id)) throw new BackupValidationError("UUID_NOT_PRESERVED", name);
    }
  }

  // Token economy integrity (report only).
  const ledger = new Map<string, number>();
  for (const t of business.token_transactions) ledger.set(String(t.user_id), (ledger.get(String(t.user_id)) ?? 0) + Number(t.delta ?? 0));
  const balanceMismatches: Json[] = [];
  let balanceTotal = 0;
  for (const p of business.profiles) {
    const bal = Number(p.token_balance ?? 0);
    balanceTotal += bal;
    const sum = ledger.get(String(p.id)) ?? 0;
    if (sum !== bal) balanceMismatches.push({ user_id: p.id, token_balance: bal, ledger_sum: sum, diff: bal - sum });
  }
  const ledgerTotal = [...ledger.values()].reduce((a, b) => a + b, 0);

  // ---------- FILES ----------
  const files: Record<string, Uint8Array> = {};
  const datasets: Json[] = [];
  const addJson = async (path: string, value: unknown, meta?: Json) => {
    const bytes = strToU8(JSON.stringify(value));
    files[path] = bytes;
    const sha = await sha256Hex(bytes);
    if (meta) datasets.push({ ...meta, file: path, bytes: bytes.length, sha256: sha });
    return sha;
  };
  const addText = (path: string, text: string) => { files[path] = strToU8(text); };

  for (const name of ESSENTIAL_DATASETS) await addJson(`business/${name}.json`, business[name], { name, tier: "essential", rows: business[name].length });
  for (const name of USEFUL_DATASETS) if (Array.isArray(business[name])) await addJson(`business/${name}.json`, business[name], { name, tier: "useful", rows: business[name].length });
  await addJson("business/auth_users.json", auth.rows, { name: "auth_users", tier: "essential", rows: auth.rows.length, note: "auth.users.id → email mapping only; no credentials" });

  const snapshotSha = await addJson("architecture/snapshot.json", architecture);
  const arch = architecture as any;
  addText("architecture/functions.sql", (arch.functions ?? []).filter((f: any) => f.definition).map((f: any) => `${f.definition}\n`).join("\n"));
  addText("architecture/triggers.sql", (arch.triggers ?? []).map((t: any) => `${t.definition};`).join("\n"));
  addText("architecture/indexes.sql", (arch.indexes ?? []).map((i: any) => `${i.definition};`).join("\n"));
  addText("architecture/constraints.sql", (arch.constraints ?? []).map((c: any) => c.sql).join("\n"));
  addText("architecture/policies.sql", (arch.policies ?? []).map(policySql).join("\n"));
  addText("architecture/enums.sql", (arch.enums ?? []).map((e: any) => `CREATE TYPE public.${q(e.name)} AS ENUM (${(e.values ?? []).map((v: string) => `'${v.replace(/'/g, "''")}'`).join(", ")});`).join("\n"));
  await addJson("architecture/cron.json", arch.cron_jobs ?? []);
  await addJson("architecture/migration_state.json", arch.migration_state ?? {});
  addText("architecture/LIMITATIONS.md", `# Architecture snapshot limitations\n\n${SNAPSHOT_LIMITATIONS.map((l) => `- ${l}`).join("\n")}\n`);

  const supMig = arch.migration_state?.supabase_migrations ?? [];
  const drzMig = arch.migration_state?.drizzle_migrations ?? [];
  const manifest: Json = {
    backup_format: BACKUP_FORMAT,
    format_version: BACKUP_FORMAT_VERSION,
    generated_at: new Date().toISOString(),
    environment: "live",
    generated_by: adminId,
    scope: "LIVE business data (is_test = false or LIVE parent) + real database architecture snapshot",
    consistency: {
      business_and_architecture: "statement_snapshot",
      detail: "Business datasets and architecture snapshot are produced by ONE SQL statement (backup_all_live_export) and therefore share a single statement-level snapshot. auth_users mapping is read separately through the Auth Admin API (best_effort).",
      auth_users: "best_effort",
      snapshot_time: data.snapshot_time,
      recount_check: recount,
      recount_drift: recountDrift,
    },
    schema_state: {
      supabase_migrations_count: supMig.length,
      last_supabase_migration: supMig.length ? supMig[supMig.length - 1] : null,
      drizzle_migrations_count: drzMig.length,
      last_drizzle_migration: drzMig.length ? drzMig[drzMig.length - 1] : null,
      architecture_snapshot_sha256: snapshotSha,
      server_version: arch.server_version ?? null,
      counts: {
        tables: arch.tables?.length ?? 0, columns: arch.columns?.length ?? 0, constraints: arch.constraints?.length ?? 0,
        indexes: arch.indexes?.length ?? 0, functions: arch.functions?.length ?? 0, triggers: arch.triggers?.length ?? 0,
        policies: arch.policies?.length ?? 0, enums: arch.enums?.length ?? 0, cron_jobs: Array.isArray(arch.cron_jobs) ? arch.cron_jobs.length : 0,
        extensions: arch.extensions?.length ?? 0, publications: arch.publications?.length ?? 0,
      },
    },
    datasets,
    datasets_excluded: EXCLUDED_DATASETS,
    integrity,
    token_economy: {
      live_profiles: business.profiles.length,
      token_balance_total: balanceTotal,
      token_transactions_count: business.token_transactions.length,
      token_transactions_delta_sum: ledgerTotal,
      token_orders_count: business.token_orders.length,
      token_order_events_count: business.token_order_events.length,
      rating_bonus_grants_count: business.rating_bonus_grants.length,
      balance_vs_ledger_mismatches: balanceMismatches.length,
      balance_vs_ledger_mismatch_detail: balanceMismatches.slice(0, 50),
      note: "Informational. A mismatch is a finding, never auto-remediated by the backup.",
    },
    snapshot_limitations: SNAPSHOT_LIMITATIONS,
    files_total: 0,
  };
  manifest.files_total = Object.keys(files).length + 1;
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));

  // ---------- SECRET / PASSWORD SCAN over the whole plaintext ----------
  const all = Object.values(files).map((b) => strFromU8(b)).join("\n");
  for (const m of SECRET_MARKERS) if (all.includes(m)) throw new BackupValidationError("SECRET_MARKER_IN_PLAINTEXT", m);
  for (const v of envSecretValues()) if (all.includes(v)) throw new BackupValidationError("ENV_SECRET_IN_PLAINTEXT");
  if (backupPassword && all.includes(backupPassword)) throw new BackupValidationError("BACKUP_PASSWORD_IN_PLAINTEXT");

  const zip = zipSync(files, { level: 6 });
  const plaintextBytes = Object.values(files).reduce((n, b) => n + b.length, 0);
  return { zip, manifest, timings: { export_ms: exportMs, auth_ms: authMs, build_ms: Date.now() - t2 }, plaintextBytes };
}

/** Read-only technical verification of a decrypted package (no DB access). */
export function verifyDecryptedPackage(zip: Uint8Array): { ok: boolean; manifest: Json; problems: string[] } {
  const problems: string[] = [];
  const files = unzipSync(zip);
  const m = files["manifest.json"];
  if (!m) return { ok: false, manifest: {}, problems: ["manifest.json missing"] };
  const manifest = JSON.parse(strFromU8(m)) as Json;
  if (manifest.backup_format !== BACKUP_FORMAT) problems.push("backup_format mismatch");
  if (manifest.environment !== "live") problems.push("environment is not live");
  for (const name of ESSENTIAL_DATASETS) if (!files[`business/${name}.json`]) problems.push(`missing business/${name}.json`);
  if (!files["architecture/snapshot.json"]) problems.push("missing architecture/snapshot.json");
  return { ok: problems.length === 0, manifest, problems };
}

export async function verifyChecksums(zip: Uint8Array, manifest: Json): Promise<string[]> {
  const files = unzipSync(zip);
  const bad: string[] = [];
  for (const d of (manifest.datasets as Json[]) ?? []) {
    const f = files[String(d.file)];
    if (!f) { bad.push(String(d.file)); continue; }
    if ((await sha256Hex(f)) !== d.sha256) bad.push(String(d.file));
  }
  return bad;
}
