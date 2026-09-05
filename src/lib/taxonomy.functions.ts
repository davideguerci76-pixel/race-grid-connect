import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TaxonomyEntry, TaxonomySnapshot } from "@/lib/taxonomy-registry";

// ---------------------------------------------------------------------------
// STEP T2 — Taxonomy authority (server side).
//
// Read path: the full snapshot is public reference data (public freelancer and
// Pit Call pages render its labels), served through the publishable client.
// Write path: admin-only SECURITY DEFINER RPCs; this module never writes to a
// taxonomy table directly. Nothing in this module touches matching, weights,
// scores, snapshots or historical records.
// ---------------------------------------------------------------------------

const CODE_RE = /^[a-z0-9_]{2,64}$/;
const LANGS = ["en", "it", "es", "fr", "de"] as const;

const labelsSchema = z
  .record(z.string(), z.string().trim().max(120))
  .refine((v) => typeof v.en === "string" && v.en.trim().length > 0, {
    message: "An English label is required",
  });

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

/** Admin read: includes deactivated entries plus live usage counts. */
export const adminGetTaxonomy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const snapshot = await readTaxonomySnapshot(context.supabase, true);
    const { data: usage, error } = await (context.supabase.rpc as any)("admin_taxonomy_usage");
    if (error) throw new Error(error.message);
    return { snapshot, usage: (usage ?? {}) as Record<string, Record<string, number>>, langs: LANGS };
  });

const upsertInput = z.object({
  kind: z.enum(["role_group", "sub_role", "skill", "discipline", "language"]),
  code: z.string().trim().min(2).max(64),
  parent: z.string().trim().max(64).nullable().optional(),
  labels: labelsSchema.optional(),
  sort_order: z.number().int().min(0).max(100000).optional(),
  is_active: z.boolean().optional(),
  expected_version: z.number().int().min(1).optional(),
});

/**
 * Create or update one taxonomy identity. The code is the immutable identity;
 * renaming means editing labels, never the code, so no stored record is ever
 * remapped. Concurrency is guarded by optimistic versioning: a stale write is
 * refused with a structured conflict and no row is touched.
 */
export const adminUpsertTaxonomy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const normalized = data.code.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    if (!CODE_RE.test(normalized)) return { ok: false as const, reason: "invalid_code" };
    if (data.kind === "sub_role" && !data.parent) return { ok: false as const, reason: "parent_required" };

    const { data: res, error } = await (context.supabase.rpc as any)("admin_taxonomy_upsert", {
      p_kind: data.kind,
      p_code: normalized,
      p_parent: data.parent ?? null,
      p_labels: data.labels ?? null,
      p_sort: data.sort_order ?? null,
      p_active: data.is_active ?? null,
      p_expected_version: data.expected_version ?? null,
    });
    if (error) throw new Error(error.message);
    return res as any;
  });

/**
 * Replace the macro-roles a skill is shown under. Presentation only: it never
 * gates eligibility, matching or SHOW ALL SKILLS, and a skill with zero
 * associations stays fully selectable under SHOW ALL.
 */
export const adminSetSkillGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ skill: z.string().trim().min(2).max(64), groups: z.array(z.string().trim().max(64)).max(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await (context.supabase.rpc as any)("admin_taxonomy_set_skill_groups", {
      p_skill: data.skill,
      p_groups: data.groups,
    });
    if (error) throw new Error(error.message);
    return res as any;
  });
