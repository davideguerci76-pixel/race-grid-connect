/**
 * STEP T2 — Runtime taxonomy registry.
 *
 * The database (tables `taxonomy_*`) is the authority for which macro-roles,
 * sub-roles, skills, disciplines and languages exist, in which order, and how
 * they are labelled per language. This module holds the fetched snapshot in a
 * plain module-level store so that every existing label helper
 * (`skillLabel`, `roleGroupLabel`, ...) can consult it without any call-site
 * change, and falls back to the historical hardcoded lists when the snapshot
 * has not loaded yet (SSR, offline, first paint).
 *
 * Label precedence, by design:
 *   1. DB label for the active language  (admin-authored translation)
 *   2. shipped i18n translation          (pre-T2 translations stay authoritative)
 *   3. DB English label                  (new entries added from the ACP)
 *   4. hardcoded English list / humanized text
 *
 * Nothing here writes to the database and nothing here affects matching.
 */

export type TaxonomyKind = "role_group" | "sub_role" | "skill" | "discipline" | "language";

export type TaxonomyEntry = {
  code: string;
  parent?: string | null;
  labels: Record<string, string>;
  sort_order: number;
  is_active: boolean;
  version: number;
};

export type TaxonomySnapshot = {
  role_groups: TaxonomyEntry[];
  sub_roles: TaxonomyEntry[];
  skills: TaxonomyEntry[];
  disciplines: TaxonomyEntry[];
  languages: TaxonomyEntry[];
  skill_groups: Record<string, string[]>;
};

export const EMPTY_SNAPSHOT: TaxonomySnapshot = {
  role_groups: [],
  sub_roles: [],
  skills: [],
  disciplines: [],
  languages: [],
  skill_groups: {},
};

let snapshot: TaxonomySnapshot | null = null;
const maps: Record<TaxonomyKind, Map<string, TaxonomyEntry>> = {
  role_group: new Map(),
  sub_role: new Map(),
  skill: new Map(),
  discipline: new Map(),
  language: new Map(),
};

export function setTaxonomySnapshot(next: TaxonomySnapshot | null | undefined) {
  if (!next) return;
  snapshot = next;
  const fill = (kind: TaxonomyKind, rows: TaxonomyEntry[]) => {
    const m = maps[kind];
    m.clear();
    for (const r of rows) m.set(r.code, r);
  };
  fill("role_group", next.role_groups);
  fill("sub_role", next.sub_roles);
  fill("skill", next.skills);
  fill("discipline", next.disciplines);
  fill("language", next.languages);
}

export function getTaxonomySnapshot(): TaxonomySnapshot | null {
  return snapshot;
}

/** DB label for a code in the requested language, or null when unknown. */
export function taxonomyLabel(kind: TaxonomyKind, code: string, lang: string): string | null {
  const entry = maps[kind].get(code);
  if (!entry) return null;
  const exact = entry.labels?.[lang];
  if (typeof exact === "string" && exact.trim()) return exact.trim();
  return null;
}

/** DB English label — used only after the shipped i18n translation misses. */
export function taxonomyFallbackLabel(kind: TaxonomyKind, code: string): string | null {
  const entry = maps[kind].get(code);
  const en = entry?.labels?.en;
  return typeof en === "string" && en.trim() ? en.trim() : null;
}

export function taxonomyEntry(kind: TaxonomyKind, code: string): TaxonomyEntry | null {
  return maps[kind].get(code) ?? null;
}

export function taxonomyActiveCodes(kind: TaxonomyKind): string[] | null {
  if (!snapshot) return null;
  return [...maps[kind].values()].filter((e) => e.is_active).map((e) => e.code);
}
