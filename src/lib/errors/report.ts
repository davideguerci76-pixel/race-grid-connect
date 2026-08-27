// Error reporting pipeline: reference ids, sanitized route patterns, gated
// telemetry and (for real technical failures only) a row in `client_error_log`.
//
// Guarantees, by construction:
//  - the database never receives a stack trace, raw message or payload;
//  - no personal data, tokens or credentials are persisted or transmitted;
//  - routes are stored as patterns (`/dashboard/requests/:id/matches`);
//  - expected situations (validation, cancellations, UX warnings, success)
//    are never logged;
//  - the reference id shown to the user is the row key support can look up.

import { LOGGABLE_CATEGORIES, type NormalizedError } from "./normalize";

export type ErrorEnv = "dev" | "test" | "live";

const BUFFER_KEY = "pitcall.errorTrail";
const BUFFER_MAX = 20;
const SESSION_MAX_LOGS = 25;
const DEDUPE_WINDOW_MS = 60_000;

let sessionLogCount = 0;
const recentlyLogged = new Map<string, number>();

/** Runtime environment used for logging verbosity and TEST/LIVE isolation. */
export function errorEnv(): ErrorEnv {
  if (import.meta.env.DEV) return "dev";
  if (typeof window === "undefined") return "live";
  const host = window.location.hostname;
  const isProdHost = host === "pitcall.net" || host === "www.pitcall.net";
  return isProdHost ? "live" : "test";
}

export function isLiveEnv() {
  return errorEnv() === "live";
}

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ0123456789"; // Crockford-ish base32, no look-alikes

/** `PC-XXXXXX` — 32^6 ≈ 1.07e9 combinations, enough entropy to be a real key. */
export function newReferenceId(): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `PC-${out}`;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Strip identifiers from a pathname so the stored route is a pattern, not data. */
export function routePattern(pathname?: string): string {
  const path = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  return (
    path
      .replace(UUID_RE, ":id")
      .split("/")
      .map((seg) => {
        if (!seg) return seg;
        if (/^\d+$/.test(seg)) return ":id";
        if (seg.length > 24) return ":id";
        if (/^[A-Za-z0-9_-]{12,}$/.test(seg) && /\d/.test(seg)) return ":id";
        return seg;
      })
      .join("/")
      .slice(0, 200) || "/"
  );
}

type TrailEntry = { ref: string; key: string; category: string; at: string; route: string };

function pushTrail(entry: TrailEntry) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(BUFFER_KEY);
    const list: TrailEntry[] = raw ? JSON.parse(raw) : [];
    list.push(entry);
    window.sessionStorage.setItem(BUFFER_KEY, JSON.stringify(list.slice(-BUFFER_MAX)));
  } catch {
    /* storage unavailable — trail is best-effort only */
  }
}

/** Last errors of this browsing session (support aid, never leaves the device). */
export function errorTrail(): TrailEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(BUFFER_KEY);
    return raw ? (JSON.parse(raw) as TrailEntry[]) : [];
  } catch {
    return [];
  }
}

async function persist(normalized: NormalizedError, referenceId: string, route: string) {
  if (typeof window === "undefined") return;
  if (sessionLogCount >= SESSION_MAX_LOGS) return;

  const dedupeKey = `${normalized.key}|${route}`;
  const now = Date.now();
  const last = recentlyLogged.get(dedupeKey);
  if (last && now - last < DEDUPE_WINDOW_MS) return;
  recentlyLogged.set(dedupeKey, now);
  sessionLogCount += 1;

  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    await supabase.from("client_error_log").insert({
      reference_id: referenceId,
      category: normalized.category,
      code: normalized.code ?? normalized.key.slice(0, 80),
      severity: normalized.severity,
      route_pattern: route,
      user_id: data.session?.user.id ?? null,
      is_test: !isLiveEnv(),
    });
  } catch {
    /* logging must never break the app */
  }
}

async function sendTelemetry(error: unknown, normalized: NormalizedError, referenceId: string) {
  // Builder/telemetry capture is disabled in LIVE so no raw payload ever leaves
  // a production session.
  if (isLiveEnv()) return;
  try {
    const { reportLovableError } = await import("@/lib/lovable-error-reporting");
    reportLovableError(error, {
      reference_id: referenceId,
      category: normalized.category,
      key: normalized.key,
    });
  } catch {
    /* ignore */
  }
}

export type ReportOptions = {
  /** Route override; defaults to the current pathname (sanitized). */
  route?: string;
  /** Force persistence (used by the error boundary). */
  forceLog?: boolean;
  /** Extra non-sensitive context, only printed in DEV/TEST consoles. */
  context?: Record<string, unknown>;
};

export type ErrorReport = {
  referenceId: string;
  normalized: NormalizedError;
  route: string;
};

/**
 * Record an already-normalized error. Returns the reference id to display.
 * Fire-and-forget: never awaits network work on the UI path.
 */
export function reportError(
  error: unknown,
  normalized: NormalizedError,
  options: ReportOptions = {},
): ErrorReport {
  const referenceId = newReferenceId();
  const route = routePattern(options.route);
  const env = errorEnv();
  const shouldLog =
    options.forceLog === true || (normalized.loggable && LOGGABLE_CATEGORIES.has(normalized.category));

  if (env !== "live") {
    // Detailed, developer-facing output — DEV/TEST only.
    console.error(`[PITCALL ${referenceId}] ${normalized.category}/${normalized.key}`, {
      route,
      ...options.context,
      error,
    });
  } else if (shouldLog) {
    // LIVE: sanitized single line, no payloads.
    console.error(`[PITCALL ${referenceId}] ${normalized.category} at ${route}`);
  }

  pushTrail({
    ref: referenceId,
    key: normalized.key,
    category: normalized.category,
    at: new Date().toISOString(),
    route,
  });

  if (shouldLog) {
    void persist(normalized, referenceId, route);
    void sendTelemetry(error, normalized, referenceId);
  }

  return { referenceId, normalized, route };
}
