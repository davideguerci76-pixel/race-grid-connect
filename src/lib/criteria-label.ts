/**
 * Shared renderer for a `missing_criteria` entry produced by the matching
 * engine. Used by match cards and by informational notifications.
 */
export function formatCriterion(c: any, t: (k: string, o?: any) => string): string {
  switch (c?.kind) {
    case "role":
    case "sub_role":
      return t("sweep_engage.criteria.role", { label: c.label ?? "" });
    case "skill":
      return t("sweep_engage.criteria.skill", { label: c.label });
    case "language":
      return t("sweep_engage.criteria.language", { code: c.code, level: c.level });
    case "education":
      return t("sweep_engage.criteria.education");
    case "day_rate":
      return t("sweep_engage.criteria.day_rate");
    case "missing_days":
      return t("sweep_engage.criteria.missing_days", { count: c.days ?? 0 });
    case "location":
      return t("sweep_engage.criteria.location", { label: c.label ?? t("sweep_engage.criteria.distant") });
    default:
      return c?.kind ?? t("sweep_engage.criteria.criterion");
  }
}
