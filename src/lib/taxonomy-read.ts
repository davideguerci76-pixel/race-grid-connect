import type { TaxonomyEntry, TaxonomySnapshot } from "@/lib/taxonomy-registry";

// Client-safe taxonomy reader: works with any Supabase client (browser,
// publishable server client, or an authenticated server-side client).

function row(r: any, parent?: string | null): TaxonomyEntry {
  return {
    code: String(r.code),
    parent: parent === undefined ? null : parent,
    labels: (r.labels ?? {}) as Record<string, string>,
    sort_order: Number(r.sort_order ?? 0),
    is_active: Boolean(r.is_active),
    version: Number(r.version ?? 1),
  };
}

export async function readTaxonomySnapshot(supabase: any, includeInactive: boolean): Promise<TaxonomySnapshot> {
  const q = (table: string) => {
    const sel = supabase.from(table).select("*").order("sort_order", { ascending: true });
    return includeInactive ? sel : sel.eq("is_active", true);
  };
  const [rg, sr, sk, di, la, assoc] = await Promise.all([
    q("taxonomy_role_groups"),
    q("taxonomy_sub_roles"),
    q("taxonomy_skills"),
    q("taxonomy_disciplines"),
    q("taxonomy_languages"),
    supabase.from("taxonomy_skill_role_groups").select("skill_code, role_group_code"),
  ]);
  for (const r of [rg, sr, sk, di, la, assoc]) if (r.error) throw new Error(r.error.message);

  const skill_groups: Record<string, string[]> = {};
  for (const a of assoc.data ?? []) {
    (skill_groups[a.skill_code] ??= []).push(a.role_group_code);
  }

  return {
    role_groups: (rg.data ?? []).map((r: any) => row(r)),
    sub_roles: (sr.data ?? []).map((r: any) => row(r, r.role_group_code)),
    skills: (sk.data ?? []).map((r: any) => row(r)),
    disciplines: (di.data ?? []).map((r: any) => row(r)),
    languages: (la.data ?? []).map((r: any) => row(r)),
    skill_groups,
  };
}

