import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readTaxonomySnapshot } from "@/lib/taxonomy.functions";
import {
  EMPTY_SNAPSHOT,
  getTaxonomySnapshot,
  setTaxonomySnapshot,
  type TaxonomySnapshot,
} from "@/lib/taxonomy-registry";
import { ROLE_GROUPS } from "@/lib/roles";
import { DISCIPLINE_OPTIONS, LANGUAGE_OPTIONS, SKILL_OPTIONS } from "@/lib/paddock";

/**
 * STEP T2 — client access to the database-managed taxonomy.
 *
 * The snapshot is public reference data read with the ordinary browser client
 * (RLS allows read to everyone). Until it resolves — during SSR, offline, or
 * the very first paint — the historical hardcoded lists are used, so no screen
 * can ever render an empty picker.
 */

function fallbackSnapshot(): TaxonomySnapshot {
  const e = (code: string, label: string, i: number, parent?: string) => ({
    code,
    parent: parent ?? null,
    labels: { en: label },
    sort_order: i * 10,
    is_active: true,
    version: 1,
  });
  const skill_groups: Record<string, string[]> = {};
  ROLE_GROUPS.forEach((g) => g.skills.forEach((s) => ((skill_groups[s] ??= []).push(g.value))));
  return {
    role_groups: ROLE_GROUPS.map((g, i) => e(g.value, g.label, i)),
    sub_roles: ROLE_GROUPS.flatMap((g) => g.subRoles.map((s, i) => e(s.value, s.label, i, g.value))),
    skills: SKILL_OPTIONS.map((o, i) => e(o.value, o.label, i)),
    disciplines: DISCIPLINE_OPTIONS.map((o, i) => e(o.value, o.label, i)),
    languages: LANGUAGE_OPTIONS.map((o, i) => e(o.value, o.label, i)),
    skill_groups,
  };
}

export const TAXONOMY_QUERY_KEY = ["taxonomy", "active"] as const;

export async function fetchActiveTaxonomy(): Promise<TaxonomySnapshot> {
  return readTaxonomySnapshot(supabase, false);
}

export type TaxonomyView = {
  snapshot: TaxonomySnapshot;
  loading: boolean;
  roleGroups: { value: string; label: string }[];
  subRolesFor: (group: string | null | undefined) => { value: string; label: string }[];
  skillsFor: (group: string | null | undefined) => string[];
  allSkills: string[];
  disciplines: string[];
  languages: string[];
};

export function useTaxonomy(): TaxonomyView {
  const { data, isLoading } = useQuery({
    queryKey: TAXONOMY_QUERY_KEY,
    queryFn: fetchActiveTaxonomy,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (data) setTaxonomySnapshot(data);
  }, [data]);

  const snapshot = data ?? getTaxonomySnapshot() ?? fallbackSnapshot();

  return useMemo(() => {
    const byOrder = <T extends { sort_order: number }>(rows: T[]) => [...rows].sort((a, b) => a.sort_order - b.sort_order);
    const roleGroups = byOrder(snapshot.role_groups).map((g) => ({ value: g.code, label: g.labels?.en ?? g.code }));
    const allSkills = byOrder(snapshot.skills).map((s) => s.code);
    return {
      snapshot: snapshot ?? EMPTY_SNAPSHOT,
      loading: isLoading,
      roleGroups,
      subRolesFor: (group) =>
        !group
          ? []
          : byOrder(snapshot.sub_roles.filter((s) => s.parent === group)).map((s) => ({
              value: s.code,
              label: s.labels?.en ?? s.code,
            })),
      skillsFor: (group) => (!group ? [] : allSkills.filter((s) => (snapshot.skill_groups[s] ?? []).includes(group))),
      allSkills,
      disciplines: byOrder(snapshot.disciplines).map((d) => d.code),
      languages: byOrder(snapshot.languages).map((l) => l.code),
    };
  }, [snapshot, isLoading]);
}
