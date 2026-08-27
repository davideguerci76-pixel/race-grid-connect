// Branded, localized toast helpers. Components must use these instead of
// calling sonner with a raw error message.

import i18n from "i18next";
import { toast } from "sonner";

import { normalizeError, type NormalizedError } from "./normalize";
import { reportError, type ReportOptions } from "./report";

function t(key: string, fallbackKey = "errors.generic"): string {
  const value = i18n.t(key);
  if (!value || value === key) return i18n.t(fallbackKey);
  return value;
}

/**
 * Show a PITCALL-branded error toast for any thrown value.
 * Technical failures also get a reference id and a `client_error_log` row.
 */
export function toastError(error: unknown, fallbackKey = "errors.generic", options: ReportOptions = {}) {
  const normalized: NormalizedError = normalizeError(error, fallbackKey);

  if (normalized.category === "cancelled") return undefined;

  const { referenceId } = reportError(error, normalized, options);
  const message = t(normalized.key, fallbackKey);

  if (normalized.severity === "warning") {
    toast.warning(message);
    return undefined;
  }

  toast.error(message, {
    description: normalized.loggable
      ? `${i18n.t("errors.reference")}: ${referenceId}`
      : undefined,
  });
  return referenceId;
}

/** Localized success feedback — never logged. */
export function toastSuccess(key: string, values?: Record<string, unknown>) {
  toast.success(i18n.t(key, values as never) as string);
}

/** Localized warning feedback (expected, non-technical) — never logged. */
export function toastWarning(key: string, values?: Record<string, unknown>) {
  toast.warning(i18n.t(key, values as never) as string);
}

/** Localized informational feedback — never logged. */
export function toastInfo(key: string, values?: Record<string, unknown>) {
  toast(i18n.t(key, values as never) as string);
}

/** Form validation feedback: user-fixable, never persisted. */
export function toastValidation(key = "errors.validation.generic", values?: Record<string, unknown>) {
  toast.warning(i18n.t(key, values as never) as string);
}
