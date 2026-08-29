/**
 * Shared renderer for a `missing_criteria` entry produced by the matching
 * engine. Used by match cards, match results and informational notifications.
 *
 * The matching engine stores raw identifiers (skill values, sub-role values,
 * language codes) in `label`/`code`. They must always be resolved to
 * user-facing labels here — never rendered as-is.
 */
import { languageLabel, languageLevelLabel, levelLabel, skillLabel, subRoleLabel, humanize } from "@/lib/labels";

export function formatCriterion(c: any, t: (k: string, o?: any) => string): string {
  switch (c?.kind) {
    case "role":
    case "sub_role": {
      const label = c.label ? subRoleLabel(c.label) : "";
      const withLevel = c.level ? `${label} (${levelLabel(c.level)})` : label;
      return t("sweep_engage.criteria.role", { label: withLevel });
    }
    case "skill":
      return t("sweep_engage.criteria.skill", { label: skillLabel(c.label) });
    case "language":
      return t("sweep_engage.criteria.language", {
        code: languageLabel(c.code, c.custom),
        level: languageLevelLabel(c.level),
      });
    case "education":
      return t("sweep_engage.criteria.education");
    case "day_rate":
      return t("sweep_engage.criteria.day_rate");
    case "missing_days":
      return t("sweep_engage.criteria.missing_days", { count: c.days ?? 0 });
    case "location":
      return t("sweep_engage.criteria.location", { label: c.label ?? t("sweep_engage.criteria.distant") });
    default:
      return c?.kind ? humanize(c.kind) : t("sweep_engage.criteria.criterion");
  }
}
