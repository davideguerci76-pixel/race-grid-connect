/**
 * Central user-facing label resolver.
 *
 * RULE: no internal identifier (snake_case DB value, enum, notification kind)
 * may ever reach the UI. Every screen must resolve values through this module,
 * which layers: i18n translation -> English taxonomy label -> humanized text.
 *
 * Stored DB values are never modified: this is display-only.
 */
import i18n from "@/i18n";
import {
  disciplineLabel,
  educationLabel,
  experienceYearsLabel,
  languageLabel,
  languageLevelLabel,
  roleLabel,
  skillLabel,
} from "@/lib/paddock";
import { levelLabel, roleGroupLabel, subRoleLabel } from "@/lib/roles";
import { resolveNotificationTarget } from "@/lib/notification-targets";

export {
  disciplineLabel,
  educationLabel,
  experienceYearsLabel,
  languageLabel,
  languageLevelLabel,
  roleLabel,
  skillLabel,
  levelLabel,
  roleGroupLabel,
  subRoleLabel,
};

/** Last-resort humanizer: never show raw snake_case. */
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function tr(key: string): string | null {
  try {
    if (i18n && typeof i18n.t === "function") {
      const exists = typeof i18n.exists === "function" ? i18n.exists(key) : true;
      if (!exists) return null;
      const out = i18n.t(key);
      if (typeof out === "string" && out && out !== key) return out;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Pit Call (request) status, including the server-authoritative review window. */
export function requestStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return tr(`sweep_engage.requests.status.${status}`) ?? humanize(status);
}

/** Engagement status: proposed / confirmed / completed / cancelled / declined / expired. */
export function engagementStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return tr(`engagements.status.${status}`) ?? humanize(status);
}

/** Notification kind chip / fallback body. */
export function notificationKindLabel(kind: string | null | undefined): string {
  if (!kind) return "—";
  return tr(`notification_kinds.${kind}`) ?? resolveNotificationTarget(kind).title ?? humanize(kind);
}

/** Role group or sub-role, whichever the record carries. */
export function roleDisplay(roleGroup?: string | null, subRole?: string | null): string {
  return subRole ? subRoleLabel(subRole) : roleGroupLabel(roleGroup);
}

/**
 * Team type. The column is free text, but onboarding/fixtures write known codes
 * (private_team, manufacturer, engineering_company, service_provider). Codes are
 * localized; anything else is shown as typed by the team, never snake_case.
 */
export function teamTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const code = value.trim().toLowerCase().replace(/\s+/g, "_");
  return tr(`team_types.${code}`) ?? (value.includes("_") ? humanize(value) : value);
}

