import { readTaxonomySnapshot } from "@/lib/taxonomy-read";

/**
 * STEP T2 — server-side taxonomy whitelist.
 *
 * Closes the T1 HIGH finding: before T2 the backend accepted any free string
 * for macro-role, sub-role and skills, so a crafted request could store a value
 * that exists nowhere in the product (a real `nonexistent_skill_xyz` row proves
 * it happened).
 *
 * Rules, deliberately conservative:
 *  - a value the record is NOT already carrying must exist and be active;
 *  - a value the record already carries is accepted unchanged, so legacy and
 *    deactivated values are never rejected and no stored record is ever
 *    silently rewritten;
 *  - unknown values are refused with a clear error, never coerced.
 */

export type TaxonomyGuard = {
  roleGroups: Set<string>;
  subRoles: Map<string, Set<string>>;
  skills: Set<string>;
  disciplines: Set<string>;
  languages: Set<string>;
};

export async function loadTaxonomyGuard(supabase: any): Promise<TaxonomyGuard> {
  const snap = await readTaxonomySnapshot(supabase, false);
  const subRoles = new Map<string, Set<string>>();
  for (const s of snap.sub_roles) {
    const key = String(s.parent ?? "");
    if (!subRoles.has(key)) subRoles.set(key, new Set());
    subRoles.get(key)!.add(s.code);
  }
  return {
    roleGroups: new Set(snap.role_groups.map((r) => r.code)),
    subRoles,
    skills: new Set(snap.skills.map((r) => r.code)),
    disciplines: new Set(snap.disciplines.map((r) => r.code)),
    languages: new Set(snap.languages.map((r) => r.code)),
  };
}

function fail(kind: string, value: string): never {
  throw new Error(`Unknown or inactive ${kind}: ${value}`);
}

/** Values already stored on the record are grandfathered in. */
export function assertAllowed(
  kind: string,
  values: readonly string[],
  allowed: Set<string>,
  existing: readonly string[] = [],
) {
  const keep = new Set(existing);
  for (const v of values) if (!keep.has(v) && !allowed.has(v)) fail(kind, v);
}

export function assertSubRolesAllowed(
  roleGroup: string,
  values: readonly string[],
  guard: TaxonomyGuard,
  existing: readonly string[] = [],
) {
  const allowed = guard.subRoles.get(roleGroup) ?? new Set<string>();
  assertAllowed("sub-role", values, allowed, existing);
}
