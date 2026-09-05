import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminGetTaxonomy, adminSetSkillGroups, adminUpsertTaxonomy } from "@/lib/taxonomy.functions";
import { TAXONOMY_QUERY_KEY } from "@/lib/use-taxonomy";
import type { TaxonomyEntry } from "@/lib/taxonomy-registry";
import { toastError } from "@/lib/errors";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/taxonomy")({
  ssr: false,
  component: AdminTaxonomy,
});

type Kind = "role_group" | "sub_role" | "skill" | "discipline" | "language";

const KIND_LABEL: Record<Kind, string> = {
  role_group: "Macro-roles",
  sub_role: "Sub-roles",
  skill: "Skills",
  discipline: "Disciplines",
  language: "Languages",
};

const LANGS = ["en", "it", "es", "fr", "de"] as const;

type Draft = {
  kind: Kind;
  code: string;
  parent: string | null;
  labels: Record<string, string>;
  sort_order: number;
  is_active: boolean;
  expected_version?: number;
  isNew: boolean;
};

function emptyDraft(kind: Kind, parent: string | null): Draft {
  return { kind, code: "", parent, labels: { en: "" }, sort_order: 0, is_active: true, isNew: true };
}

function toDraft(kind: Kind, e: TaxonomyEntry): Draft {
  return {
    kind,
    code: e.code,
    parent: e.parent ?? null,
    labels: { ...(e.labels ?? {}) },
    sort_order: e.sort_order,
    is_active: e.is_active,
    expected_version: e.version,
    isNew: false,
  };
}

function AdminTaxonomy() {
  const { t } = useTranslation();
  const load = useServerFn(adminGetTaxonomy);
  const upsert = useServerFn(adminUpsertTaxonomy);
  const setGroups = useServerFn(adminSetSkillGroups);
  const qc = useQueryClient();

  const [tab, setTab] = useState<Kind>("role_group");
  const [parent, setParent] = useState<string>("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["admin-taxonomy"], queryFn: () => load() });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-taxonomy"] });
    void qc.invalidateQueries({ queryKey: TAXONOMY_QUERY_KEY });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) =>
      upsert({
        data: {
          kind: d.kind,
          code: d.code,
          parent: d.parent,
          labels: Object.fromEntries(Object.entries(d.labels).filter(([, v]) => v && v.trim())) as Record<string, string>,
          sort_order: d.sort_order,
          is_active: d.is_active,
          ...(d.isNew ? {} : { expected_version: d.expected_version }),
        },
      }),
    onSuccess: (res: any) => {
      if (res?.ok === false && res?.conflict === "stale_version") {
        toast.warning("This entry changed elsewhere. Reload before saving again.");
        refresh();
        return;
      }
      if (res?.ok === false) {
        toast.warning(String(res?.reason ?? "Could not save"));
        return;
      }
      toast.success("Saved");
      setDraft(null);
      refresh();
    },
    onError: (e) => toastError(e),
  });

  const assoc = useMutation({
    mutationFn: async (v: { skill: string; groups: string[] }) => setGroups({ data: v }),
    onSuccess: () => {
      toast.success("Associations updated");
      refresh();
    },
    onError: (e) => toastError(e),
  });

  const rows: TaxonomyEntry[] = useMemo(() => {
    const s = data?.snapshot;
    if (!s) return [];
    const list =
      tab === "role_group"
        ? s.role_groups
        : tab === "sub_role"
          ? s.sub_roles.filter((r) => !parent || r.parent === parent)
          : tab === "skill"
            ? s.skills
            : tab === "discipline"
              ? s.disciplines
              : s.languages;
    const f = filter.trim().toLowerCase();
    return (f ? list.filter((r) => r.code.includes(f) || (r.labels?.en ?? "").toLowerCase().includes(f)) : list).slice();
  }, [data, tab, parent, filter]);

  const usage = (kind: Kind, code: string) => Number(data?.usage?.[kind]?.[code] ?? 0);

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground">{t("sweep_admin_a.checking_access")}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black italic tracking-tighter">Taxonomy</h2>
        <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
          Macro-roles, sub-roles, skills, disciplines and languages are managed here and take effect immediately, with no
          release needed. A code is a permanent identity: rename by editing labels, and retire a value by switching it off
          — entries are never deleted, so past profiles, Pit Calls and engagements keep reading exactly as before.
          Matching behaviour is untouched by anything on this page.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => {
              setTab(k);
              setDraft(null);
            }}
            className={`border px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
              tab === k ? "border-racing-red bg-racing-red/10 text-racing-red" : "border-border hover:bg-secondary"
            }`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {tab === "sub_role" && (
          <select
            value={parent}
            onChange={(e) => setParent(e.target.value)}
            className="border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">All macro-roles</option>
            {data.snapshot.role_groups.map((g) => (
              <option key={g.code} value={g.code}>
                {g.labels?.en ?? g.code}
              </option>
            ))}
          </select>
        )}
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search"
          className="border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={() => setDraft(emptyDraft(tab, tab === "sub_role" ? parent || null : null))}
          className="border border-racing-red bg-racing-red/10 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-racing-red"
        >
          Add {KIND_LABEL[tab].replace(/s$/, "")}
        </button>
      </div>

      {draft && (
        <div className="border border-racing-red/50 bg-secondary/40 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs">
              <span className="font-bold uppercase tracking-widest text-muted-foreground">Code (permanent)</span>
              <input
                value={draft.code}
                disabled={!draft.isNew}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
              />
            </label>
            {draft.kind === "sub_role" && (
              <label className="text-xs">
                <span className="font-bold uppercase tracking-widest text-muted-foreground">Macro-role</span>
                <select
                  value={draft.parent ?? ""}
                  disabled={!draft.isNew}
                  onChange={(e) => setDraft({ ...draft, parent: e.target.value || null })}
                  className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
                >
                  <option value="">—</option>
                  {data.snapshot.role_groups.map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.labels?.en ?? g.code}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {LANGS.map((l) => (
              <label key={l} className="text-xs">
                <span className="font-bold uppercase tracking-widest text-muted-foreground">
                  Label {l.toUpperCase()}
                  {l === "en" ? " *" : ""}
                </span>
                <input
                  value={draft.labels[l] ?? ""}
                  onChange={(e) => setDraft({ ...draft, labels: { ...draft.labels, [l]: e.target.value } })}
                  className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
            ))}
            <label className="text-xs">
              <span className="font-bold uppercase tracking-widest text-muted-foreground">Order</span>
              <input
                type="number"
                value={draft.sort_order}
                onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })}
                className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-end gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
              />
              <span className="font-bold uppercase tracking-widest text-muted-foreground">Active</span>
            </label>
          </div>
          {!draft.isNew && usage(draft.kind, draft.code) > 0 && !draft.is_active && (
            <p className="mt-3 text-xs text-racing-red">
              In use by {usage(draft.kind, draft.code)} record(s). Switching it off hides it from new choices; existing
              records keep it.
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              disabled={save.isPending || !draft.code.trim() || !(draft.labels.en ?? "").trim()}
              onClick={() => save.mutate(draft)}
              className="border border-racing-red bg-racing-red/10 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-racing-red disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setDraft(null)}
              className="border border-border px-4 py-2 text-[11px] font-bold uppercase tracking-widest"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">English label</th>
              {tab === "sub_role" && <th className="px-3 py-2">Macro-role</th>}
              {tab === "skill" && <th className="px-3 py-2">Shown under</th>}
              <th className="px-3 py-2">Translations</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">In use</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.parent ?? ""}:${r.code}`} className="border-b border-border/60">
                <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                <td className="px-3 py-2">{r.labels?.en ?? "—"}</td>
                {tab === "sub_role" && <td className="px-3 py-2 text-xs">{r.parent}</td>}
                {tab === "skill" && (
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {data.snapshot.role_groups.map((g) => {
                        const on = (data.snapshot.skill_groups[r.code] ?? []).includes(g.code);
                        return (
                          <button
                            key={g.code}
                            disabled={assoc.isPending}
                            onClick={() => {
                              const cur = data.snapshot.skill_groups[r.code] ?? [];
                              assoc.mutate({
                                skill: r.code,
                                groups: on ? cur.filter((c) => c !== g.code) : [...cur, g.code],
                              });
                            }}
                            title={g.labels?.en ?? g.code}
                            className={`border px-1.5 py-0.5 text-[10px] uppercase ${
                              on ? "border-racing-red bg-racing-red/10 text-racing-red" : "border-border text-muted-foreground"
                            }`}
                          >
                            {g.code.slice(0, 4)}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                )}
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {LANGS.filter((l) => l !== "en" && (r.labels?.[l] ?? "").trim()).length}/4
                </td>
                <td className="px-3 py-2 text-xs">{r.sort_order}</td>
                <td className="px-3 py-2 text-xs">{usage(tab, r.code) || "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {r.is_active ? <span className="text-emerald-500">Active</span> : <span className="text-muted-foreground">Off</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => setDraft(toDraft(tab, r))}
                    className="border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Nothing here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
