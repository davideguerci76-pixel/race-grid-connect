// OPS-BR-01B — BACKUP ALL (LIVE) v1 — authenticated raw HTTP endpoint (binary download).
// Gate (all server-side): valid bearer → Admin role (RLS user context) → recent re-authentication
// (JWT `amr` timestamp ≤ REAUTH_MAX_AGE_S) → backup password policy → generate → encrypt → verify → stream.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const REAUTH_MAX_AGE_S = 300;

type Amr = { method?: string; timestamp?: number }[];

export function evaluateReauth(claims: Record<string, unknown>, nowSec = Math.floor(Date.now() / 1000)) {
  const amr = claims["amr"] as Amr | undefined;
  if (!Array.isArray(amr) || amr.length === 0) return { ok: false as const, reason: "NO_REAUTH_EVIDENCE", method: null, age_s: null };
  let latest: { method?: string; timestamp?: number } | null = null;
  for (const e of amr) if (typeof e?.timestamp === "number" && (!latest || e.timestamp > (latest.timestamp ?? 0))) latest = e;
  if (!latest?.timestamp) return { ok: false as const, reason: "NO_REAUTH_EVIDENCE", method: null, age_s: null };
  const age = nowSec - latest.timestamp;
  if (age > REAUTH_MAX_AGE_S) return { ok: false as const, reason: "REAUTH_STALE", method: latest.method ?? null, age_s: age };
  return { ok: true as const, reason: null, method: latest.method ?? null, age_s: age };
}

function deny(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}_${p(d.getUTCHours())}-${p(d.getUTCMinutes())}`;
}

export const Route = createFileRoute("/api/admin/backup-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !key) return deny(500, "SERVER_MISCONFIGURED");

        // 1. Authentication
        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) return deny(401, "UNAUTHENTICATED");
        const token = authHeader.slice(7);
        if (token.split(".").length !== 3) return deny(401, "UNAUTHENTICATED");
        const supabase = createClient<Database>(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
        const claims = claimsData?.claims as Record<string, unknown> | undefined;
        const userId = claims?.["sub"] as string | undefined;
        if (claimsErr || !claims || !userId) return deny(401, "UNAUTHENTICATED");

        // 2. Admin role — read through the user's own RLS context (never through the admin client)
        const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
        if (!role) return deny(403, "FORBIDDEN");

        // 3. Recent re-authentication (server-side, from the token's authentication-method claims)
        const reauth = evaluateReauth(claims);
        if (!reauth.ok) return deny(403, reauth.reason, { max_age_s: REAUTH_MAX_AGE_S, age_s: reauth.age_s });

        // 4. Backup password (used once, never persisted, never logged)
        let password = "";
        try {
          const body = (await request.json()) as { backup_password?: unknown };
          if (typeof body?.backup_password !== "string") return deny(400, "BACKUP_PASSWORD_REQUIRED");
          password = body.backup_password;
        } catch {
          return deny(400, "BAD_REQUEST");
        }
        const { assertBackupPasswordPolicy, encryptBackup, decryptBackup, sha256Hex } = await import("@/lib/backup-crypto.server");
        try {
          assertBackupPasswordPolicy(password);
        } catch (e) {
          return deny(400, e instanceof Error ? e.message : "BACKUP_PASSWORD_INVALID");
        }

        const { buildLiveBackup, verifyDecryptedPackage, verifyChecksums, BACKUP_FORMAT_VERSION } = await import("@/lib/backup-all.server");
        const { logAdminAction } = await import("@/lib/admin-helpers");
        const started = Date.now();
        const audit = (details: Record<string, unknown>) =>
          logAdminAction(userId, null, "BACKUP_ALL_LIVE", { ...details, format_version: BACKUP_FORMAT_VERSION, reauth_method: reauth.method, reauth_age_s: reauth.age_s }).catch(() => {});

        try {
          // 5. Generate (read-only) → 6. encrypt → 7. discard plaintext → 8. verify → 9. stream
          const built = await buildLiveBackup(userId, password);
          const tEnc = Date.now();
          const { bytes } = await encryptBackup(built.zip, password);
          const encryptMs = Date.now() - tEnc;
          built.zip.fill(0);

          const tVer = Date.now();
          const roundTrip = await decryptBackup(bytes, password);
          const verified = verifyDecryptedPackage(roundTrip);
          const badSums = await verifyChecksums(roundTrip, verified.manifest);
          roundTrip.fill(0);
          const verifyMs = Date.now() - tVer;
          password = "";
          if (!verified.ok || badSums.length) {
            await audit({ outcome: "failure", stage: "post_encryption_verify", problems: verified.problems, bad_checksums: badSums, duration_ms: Date.now() - started });
            return deny(500, "BACKUP_VERIFY_FAILED", { problems: verified.problems, bad_checksums: badSums });
          }

          const sha = await sha256Hex(bytes);
          const datasetCount = (built.manifest.datasets as unknown[]).length;
          await audit({
            outcome: "success", dataset_count: datasetCount, file_bytes: bytes.length, file_sha256: sha, plaintext_bytes: built.plaintextBytes,
            zip_bytes_note: "plaintext discarded after encryption", export_ms: built.timings.export_ms, auth_ms: built.timings.auth_ms,
            build_ms: built.timings.build_ms, encrypt_ms: encryptMs, verify_ms: verifyMs, duration_ms: Date.now() - started,
          });
          const filename = `pitcall-backup-live-${stamp(new Date())}.pitbackup`;
          return new Response(bytes, {
            status: 200,
            headers: {
              "content-type": "application/octet-stream",
              "content-disposition": `attachment; filename="${filename}"`,
              "content-length": String(bytes.length),
              "cache-control": "no-store",
              "x-pitcall-backup-sha256": sha,
              "x-pitcall-backup-datasets": String(datasetCount),
              "x-pitcall-backup-filename": filename,
              "x-pitcall-backup-timings": JSON.stringify({ ...built.timings, encrypt_ms: encryptMs, verify_ms: verifyMs, total_ms: Date.now() - started }),
            },
          });
        } catch (e) {
          password = "";
          const code = e instanceof Error ? e.message.split(":")[0] : "BACKUP_FAILED";
          console.error("[backup-all] failed:", code);
          await audit({ outcome: "failure", error: code, duration_ms: Date.now() - started });
          return deny(500, "BACKUP_FAILED", { code });
        }
      },
    },
  },
});
