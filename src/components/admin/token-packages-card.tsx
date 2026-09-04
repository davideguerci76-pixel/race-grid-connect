import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  adminListTokenPackages,
  adminCreateTokenPackage,
  adminUpdateTokenPackage,
  derivedDiscountPct,
} from "@/lib/token-packages.functions";

// STEP S2.E — ACP Token Packages management.
// Editable authorities: token quantity, base price, active, sort order, label key.
// Discount %, nominal value, saving and effective €/token are DERIVED server-side
// and shown read-only; the nominal token price lives in the settings above.

type Row = {
  code: string;
  label_key: string;
  token_quantity: number;
  price_cents: number;
  currency: string;
  sort_order: number;
  version: number;
  is_active: boolean;
  nominal_token_price_cents: number;
  nominal_value_cents: number;
  savings_cents: number;
  discount_pct: number;
  effective_price_per_token_cents: number;
  updated_at: string;
};

const eur = (cents: number) => (cents / 100).toFixed(2);

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("stale_version")) return "The package was modified by another Admin. Reload and try again.";
  if (msg.includes("code is immutable")) return "The package code cannot be changed after creation.";
  if (msg.includes("duplicate key")) return "A package with this code already exists.";
  if (msg.includes("token_packages_code_format")) return "Code must be 3–40 chars, lowercase letters, digits or underscore.";
  if (msg.includes("cannot be deleted")) return "Packages cannot be deleted — deactivate them instead.";
  if (msg.includes("Unrecognized key") || msg.includes("unrecognized_keys"))
    return "Rejected: the discount is derived and cannot be sent by the client.";
  if (msg.includes("Forbidden")) return "Admin only.";
  return msg;
}

type Draft = {
  code: string;
  label_key: string;
  token_quantity: number;
  price_cents: number;
  sort_order: number;
  is_active: boolean;
};

function draftFrom(r: Row): Draft {
  return {
    code: r.code,
    label_key: r.label_key,
    token_quantity: r.token_quantity,
    price_cents: r.price_cents,
    sort_order: r.sort_order,
    is_active: r.is_active,
  };
}

function localIssues(d: Draft, isNew: boolean): string[] {
  const out: string[] = [];
  if (isNew && !/^[a-z0-9_]{3,40}$/.test(d.code)) out.push("Code must be 3–40 chars: lowercase letters, digits, underscore.");
  if (!d.label_key.trim()) out.push("Label key is required.");
  if (!Number.isInteger(d.token_quantity) || d.token_quantity <= 0) out.push("Token quantity must be a positive integer.");
  if (!Number.isInteger(d.price_cents) || d.price_cents <= 0) out.push("Price must be greater than zero.");
  if (!Number.isInteger(d.sort_order) || d.sort_order < 0) out.push("Sort order must be zero or a positive integer.");
  return out;
}

export function TokenPackagesCard({ referenceCents }: { referenceCents: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useServerFn(adminListTokenPackages);
  const create = useServerFn(adminCreateTokenPackage);
  const update = useServerFn(adminUpdateTokenPackage);

  const { data, isLoading } = useQuery({ queryKey: ["admin-token-packages"], queryFn: () => list() });
  const rows = (data ?? []) as unknown as Row[];

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [creating, setCreating] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-token-packages"] });
    qc.invalidateQueries({ queryKey: ["token-packages"] });
  };

  const STALE_MESSAGE = "The package was modified by another Admin. Reload and try again.";

  /** Optimistic-lock conflict is data, not a fault: report it and resync. */
  const handleUpdateResult = (res: unknown, onApplied: () => void) => {
    const r = res as { ok?: boolean; conflict?: string } | undefined;
    if (r && r.ok === false && r.conflict === "stale_version") {
      toast.error(STALE_MESSAGE);
      setEditing(null);
      setDraft(null);
      invalidate();
      return;
    }
    onApplied();
  };

  const saveMut = useMutation({
    mutationFn: async (payload: { draft: Draft; version: number }) =>
      update({
        data: {
          code: payload.draft.code,
          expected_version: payload.version,
          label_key: payload.draft.label_key,
          sort_order: payload.draft.sort_order,
          is_active: payload.draft.is_active,
          token_quantity: payload.draft.token_quantity,
          price_cents: payload.draft.price_cents,
          currency: "EUR" as const,
        },
      }),
    onSuccess: (res) =>
      handleUpdateResult(res, () => {
        toast.success("Package saved");
        setEditing(null);
        setDraft(null);
        invalidate();
      }),
    onError: (e) => toast.error(friendlyError(e)),
  });

  const createMut = useMutation({
    mutationFn: async (d: Draft) =>
      create({
        data: {
          code: d.code,
          label_key: d.label_key,
          sort_order: d.sort_order,
          is_active: d.is_active,
          token_quantity: d.token_quantity,
          price_cents: d.price_cents,
          currency: "EUR" as const,
        },
      }),
    onSuccess: () => {
      toast.success("Package created");
      setCreating(false);
      setDraft(null);
      invalidate();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const toggleMut = useMutation({
    mutationFn: async (r: Row) =>
      update({ data: { code: r.code, expected_version: r.version, is_active: !r.is_active } }),
    onSuccess: (res) =>
      handleUpdateResult(res, () => {
        toast.success("Package status updated");
        invalidate();
      }),
    onError: (e) => toast.error(friendlyError(e)),
  });

  const issues = useMemo(() => (draft ? localIssues(draft, creating) : []), [draft, creating]);

  const numInput = (value: number, onChange: (n: number) => void, step = "1") => (
    <input
      type="number"
      step={step}
      min={0}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-28 border border-border bg-background px-2 py-1 text-right font-mono text-sm"
    />
  );

  const editor = (isNew: boolean, version?: number) => {
    if (!draft) return null;
    const nominal = referenceCents * (draft.token_quantity > 0 ? draft.token_quantity : 0);
    const saving = Math.max(0, nominal - draft.price_cents);
    const pct = derivedDiscountPct(nominal, draft.price_cents);
    const perToken = draft.token_quantity > 0 ? Math.round(draft.price_cents / draft.token_quantity) : 0;
    return (
      <div className="mt-3 border border-racing-red/60 bg-racing-red/5 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <div className="font-mono uppercase text-muted-foreground">code</div>
            <input
              disabled={!isNew}
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              className="mt-1 w-full border border-border bg-background px-2 py-1 font-mono text-sm disabled:opacity-50"
            />
            {!isNew && <div className="mt-1 text-[11px] text-muted-foreground">Immutable after creation.</div>}
          </label>
          <label className="text-xs">
            <div className="font-mono uppercase text-muted-foreground">label key</div>
            <input
              value={draft.label_key}
              onChange={(e) => setDraft({ ...draft, label_key: e.target.value })}
              className="mt-1 w-full border border-border bg-background px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="font-mono uppercase text-muted-foreground">token quantity</span>
            {numInput(draft.token_quantity, (n) => setDraft({ ...draft, token_quantity: Math.round(n) }))}
          </label>
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="font-mono uppercase text-muted-foreground">base price €</span>
            {numInput(Number((draft.price_cents / 100).toFixed(2)), (n) =>
              setDraft({ ...draft, price_cents: Math.round(n * 100) }), "0.01")}
          </label>
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="font-mono uppercase text-muted-foreground">sort order</span>
            {numInput(draft.sort_order, (n) => setDraft({ ...draft, sort_order: Math.round(n) }))}
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
            />
            <span className="font-mono uppercase text-muted-foreground">active</span>
          </label>
          <div className="flex items-end justify-end text-xs">
            <span className="font-mono text-muted-foreground">currency EUR (fixed)</span>
          </div>
        </div>

        <div className="mt-2 border border-border/60 bg-secondary/40 p-2 font-mono text-[11px] text-muted-foreground">
          <div className="mb-1 uppercase tracking-widest text-foreground">derived (read-only)</div>
          nominal value € {eur(nominal)} · saving € {eur(saving)} · discount {pct}% · € {eur(perToken)}/token
          <div className="mt-1">nominal token price € {eur(referenceCents)} (settings above)</div>
        </div>

        {issues.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-[11px] text-racing-red">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex gap-2">
          <button
            disabled={issues.length > 0 || saveMut.isPending || createMut.isPending}
            onClick={() => (isNew ? createMut.mutate(draft) : saveMut.mutate({ draft, version: version! }))}
            className="bg-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-40"
          >
            {isNew ? "Create package" : "Save package"}
          </button>
          <button
            onClick={() => {
              setDraft(null);
              setEditing(null);
              setCreating(false);
            }}
            className="border border-border px-4 py-2 text-xs font-bold uppercase tracking-widest"
          >
            {t("sweep_admin_b.common.cancel", { defaultValue: "Cancel" })}
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="mt-10">
      <div className="mb-2 flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-racing-yellow">Token packages</div>
          <div className="text-xs text-muted-foreground">
            Authoritative commercial terms (tax-exclusive base prices). Discount % is derived from the nominal token
            price — never typed in. Packages are never deleted — deactivate them.
          </div>
        </div>
        {!creating && (
          <button
            onClick={() => {
              setEditing(null);
              setCreating(true);
              setDraft({
                code: "",
                label_key: "",
                token_quantity: 10,
                price_cents: referenceCents * 10,
                sort_order: 40,
                is_active: true,
              });
            }}
            className="border border-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-racing-red"
          >
            New package
          </button>
        )}
      </div>

      {creating && editor(true)}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("sweep_admin_b.common.loading")}</div>
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => (
            <div key={r.code} className="border border-border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold">
                    {r.token_quantity} tokens{" "}
                    <span className={r.is_active ? "text-racing-yellow" : "text-muted-foreground"}>
                      · {r.is_active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] uppercase text-muted-foreground">
                    {r.code} · v{r.version} · sort {r.sort_order} · {r.label_key}
                  </div>
                  <div className="mt-1 font-mono text-[11px]">
                    € {eur(r.price_cents)} base · nominal € {eur(r.nominal_value_cents)} · saving €{" "}
                    {eur(r.savings_cents)} · −{r.discount_pct}% · € {eur(r.effective_price_per_token_cents)}/token
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => {
                      setCreating(false);
                      setEditing(r.code);
                      setDraft(draftFrom(r));
                    }}
                    className="border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest"
                  >
                    Edit
                  </button>
                  <button
                    disabled={toggleMut.isPending}
                    onClick={() => toggleMut.mutate(r)}
                    className="border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest disabled:opacity-40"
                  >
                    {r.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
              {editing === r.code && editor(false, r.version)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
