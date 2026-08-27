// Central translation layer between raw runtime errors (Supabase/Postgres, fetch,
// auth, PWA) and the branded, localized feedback PITCALL shows to users.
//
// Nothing raw ever leaves this module: callers receive a translation key plus a
// classification. Raw messages are only used internally for pattern matching and
// (in non-LIVE environments) for the developer console.

export type ErrorCategory =
  | "crash"
  | "server_error"
  | "auth_failure"
  | "forbidden"
  | "network"
  | "pwa"
  | "operation_failure"
  // Non-loggable, expected situations:
  | "validation"
  | "cancelled"
  | "ux_warning";

export type ErrorSeverity = "warning" | "error" | "fatal";

export type NormalizedError = {
  /** i18n key under `errors.*` — always resolvable, never a raw message. */
  key: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  /** Short, non-sensitive machine code (e.g. `pg.23505`, `http.500`). */
  code?: string;
  /** Whether this error belongs in `client_error_log`. */
  loggable: boolean;
};

/** Categories that are real technical problems worth persisting for support. */
export const LOGGABLE_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  "crash",
  "server_error",
  "auth_failure",
  "forbidden",
  "network",
  "pwa",
  "operation_failure",
]);

function rawMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message ?? "";
  if (typeof error === "object") {
    const e = error as Record<string, unknown>;
    return [e["message"], e["error_description"], e["error"], e["details"], e["hint"]]
      .filter((v) => typeof v === "string")
      .join(" | ");
  }
  return "";
}

function statusOf(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const s = e["status"] ?? e["statusCode"] ?? e["code"];
    if (typeof s === "number") return s;
    if (typeof s === "string" && /^\d{3}$/.test(s)) return Number(s);
  }
  return undefined;
}

function pgCode(error: unknown): string | undefined {
  if (error && typeof error === "object") {
    const c = (error as Record<string, unknown>)["code"];
    if (typeof c === "string" && /^[0-9A-Z]{5}$/.test(c)) return c;
  }
  return undefined;
}

const make = (
  key: string,
  category: ErrorCategory,
  severity: ErrorSeverity = "error",
  code?: string,
): NormalizedError => ({
  key,
  category,
  severity,
  code,
  loggable: LOGGABLE_CATEGORIES.has(category),
});

/**
 * Classify any thrown value into a branded, localized outcome.
 * `fallbackKey` lets a caller name the failed operation (e.g. `errors.op.saveProfile`).
 */
export function normalizeError(error: unknown, fallbackKey = "errors.generic"): NormalizedError {
  // Explicit user cancellation — never logged, never toasted as a failure.
  if (error instanceof DOMException && error.name === "AbortError") {
    return make("errors.cancelled", "cancelled", "warning");
  }

  const msg = rawMessage(error).toLowerCase();
  const status = statusOf(error);
  const pg = pgCode(error);

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return make("errors.offline", "network", "warning", "net.offline");
  }

  if (msg.includes("cancel") && msg.includes("user")) {
    return make("errors.cancelled", "cancelled", "warning");
  }

  // Network / timeout
  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    error instanceof TypeError
  ) {
    return make("errors.network", "network", "error", "net.fetch");
  }
  // Sign-up / password problems the user can fix themselves.
  if (msg.includes("weak and easy to guess") || msg.includes("weak_password") || msg.includes("pwned")) {
    return make("errors.auth.weakPassword", "validation", "warning", "auth.weak_password");
  }
  if (msg.includes("password should be at least") || msg.includes("password should contain")) {
    return make("errors.auth.passwordTooShort", "validation", "warning", "auth.password_rules");
  }
  if (msg.includes("user already registered") || msg.includes("already been registered")) {
    return make("errors.auth.emailTaken", "validation", "warning", "auth.email_taken");
  }
  if (msg.includes("unable to validate email address") || msg.includes("invalid email")) {
    return make("errors.auth.invalidEmail", "validation", "warning", "auth.invalid_email");
  }
  if (msg.includes("email rate limit") || msg.includes("over_email_send_rate_limit")) {
    return make("errors.rateLimited", "operation_failure", "warning", "http.429");
  }

  // Auth / session

  if (
    msg.includes("jwt") ||
    msg.includes("refresh token") ||
    msg.includes("session") ||
    msg.includes("invalid login credentials") ||
    msg.includes("email not confirmed") ||
    msg.includes("auth session missing") ||
    status === 401
  ) {
    if (msg.includes("invalid login credentials")) {
      // Expected sign-in mistake: user-facing, not a technical failure.
      return make("errors.auth.invalidCredentials", "validation", "warning");
    }
    if (msg.includes("email not confirmed")) {
      return make("errors.auth.emailNotConfirmed", "validation", "warning");
    }
    return make("errors.auth.session", "auth_failure", "error", "auth.401");
  }

  // Permission
  if (
    status === 403 ||
    pg === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("not allowed")
  ) {
    return make("errors.forbidden", "forbidden", "error", pg ? `pg.${pg}` : "http.403");
  }

  // Postgres constraint / data issues that map to a user-fixable state
  if (pg === "23505" || msg.includes("duplicate key")) {
    return make("errors.duplicate", "validation", "warning", "pg.23505");
  }
  if (pg === "23503") {
    return make("errors.conflict", "validation", "warning", "pg.23503");
  }
  if (pg === "23514" || pg === "23502") {
    return make("errors.invalidData", "validation", "warning", `pg.${pg}`);
  }

  // Business rules raised by our own RPCs with a stable prefix
  const raw = rawMessage(error);
  const business = /pitcall:([a-z0-9_.]+)/i.exec(raw);
  if (business) {
    return make(`errors.rule.${business[1]}`, "validation", "warning", "rule");
  }

  if (msg.includes("insufficient tokens") || msg.includes("not enough tokens")) {
    return make("errors.tokens.insufficient", "validation", "warning", "rule.tokens");
  }

  // Server errors
  if ((status && status >= 500) || msg.includes("internal server error") || msg.includes("500")) {
    return make("errors.server", "server_error", "error", `http.${status ?? 500}`);
  }
  if (status === 404) {
    return make("errors.notFound", "operation_failure", "warning", "http.404");
  }
  if (status === 429) {
    return make("errors.rateLimited", "operation_failure", "warning", "http.429");
  }

  return make(fallbackKey, "operation_failure", "error");
}

/** Classify an error-boundary crash. Always loggable. */
export function normalizeCrash(error: unknown): NormalizedError {
  const base = normalizeError(error, "errors.crash");
  if (base.category === "network" || base.category === "auth_failure") return base;
  return { ...base, key: "errors.crash", category: "crash", severity: "fatal", loggable: true };
}
