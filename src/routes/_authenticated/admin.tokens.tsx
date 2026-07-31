import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { adminListSettings, adminUpdateSettings } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/tokens")({
  component: AdminTokensPage,
});

type Setting = {
  key: string;
  value_num: number;
  category: string;
  label: string;
  description: string | null;
  unit: string;
  sort_order: number;
  updated_at: string;
};

const CATEGORIES: { id: string; title: string; blurb: string }[] = [
  { id: "economics", title: "Token economics", blurb: "Retail value of a single token. All pack pricing on the buy page derives from this." },
  { id: "costs", title: "Operational costs (tokens spent)", blurb: "Amount of tokens deducted for each user action. Reads apply platform-wide on the next call." },
  { id: "rewards", title: "Rewards & incentives (tokens credited)", blurb: "Tokens credited automatically to users for the listed actions." },
  { id: "refunds", title: "Zero-match refunds", blurb: "Refund policy when a Pit Call returns 0 total matches. Percentages compute automatically from the number of hard filters on the Pit Call." },
];

function AdminTokensPage() {
  const qc = useQueryClient();
  const list = useServerFn(adminListSettings);
  const save = useServerFn(adminUpdateSettings);
  const { data, isLoading } = useQuery({ queryKey: ["admin-settings"], queryFn: () => list() });

  const [values, setValues] = useState<Record<string, number>>({});
  useEffect(() => {
    if (data) {
      const m: Record<string, number> = {};
      for (const s of data as Setting[]) m[s.key] = Number(s.value_num);
      setValues(m);
    }
  }, [data]);

  const dirty = useMemo(() => {
    if (!data) return [] as { key: string; value_num: number }[];
    const out: { key: string; value_num: number }[] = [];
    for (const s of data as Setting[]) {
      const v = values[s.key];
      if (v == null || isNaN(v)) continue;
      if (Number(v) !== Number(s.value_num)) out.push({ key: s.key, value_num: Number(v) });
    }
    return out;
  }, [data, values]);

  const mut = useMutation({
    mutationFn: () => save({ data: { updates: dirty } }),
    onSuccess: () => {
      toast.success(`Saved ${dirty.length} change${dirty.length === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      qc.invalidateQueries({ queryKey: ["platform-settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const rows = (data ?? []) as Setting[];
  const priceEur = values["token_price_eur"] ?? 0;

  return (
    <div className="max-w-3xl">
      <div className="mb-2 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Token configuration</h2>
          <p className="text-sm text-muted-foreground">
            Any change here takes effect immediately across the platform (post Pit Call, unlock, reveal, rating reward, signup bonus…). New future features that spend or credit tokens must register their cost here.
          </p>
        </div>
        <button
          disabled={dirty.length === 0 || mut.isPending}
          onClick={() => mut.mutate()}
          className="bg-racing-red px-4 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-40"
        >
          {mut.isPending ? "Saving…" : `Save changes${dirty.length ? ` (${dirty.length})` : ""}`}
        </button>
      </div>

      {CATEGORIES.map((cat) => {
        const catRows = rows.filter((r) => r.category === cat.id);
        if (catRows.length === 0) return null;
        return (
          <section key={cat.id} className="mt-6">
            <div className="mb-2">
              <div className="text-[11px] font-bold uppercase tracking-widest text-racing-yellow">{cat.title}</div>
              <div className="text-xs text-muted-foreground">{cat.blurb}</div>
            </div>
            <div className="grid gap-2">
              {catRows.map((s) => {
                const v = values[s.key] ?? 0;
                const changed = Number(v) !== Number(s.value_num);
                const isEur = s.unit === "eur";
                const step = isEur ? "0.01" : "1";
                const min = 0;
                return (
                  <label key={s.key} className={`flex items-center justify-between gap-4 border p-3 ${changed ? "border-racing-red bg-racing-red/5" : "border-border bg-card"}`}>
                    <div className="min-w-0">
                      <div className="font-bold">{s.label}</div>
                      <div className="font-mono text-[11px] uppercase text-muted-foreground">{s.key}</div>
                      {s.description && <div className="mt-1 text-xs text-muted-foreground">{s.description}</div>}
                      {s.key === "token_price_eur" && priceEur > 0 && (
                        <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                          Pack preview: 10 → € {(priceEur * 10).toFixed(2)} · 50 → € {(priceEur * 50).toFixed(2)} · 200 → € {(priceEur * 200).toFixed(2)}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isEur && <span className="font-mono text-xs">€</span>}
                      <input
                        type="number"
                        step={step}
                        min={min}
                        value={v}
                        onChange={(e) => setValues((prev) => ({ ...prev, [s.key]: parseFloat(e.target.value) || 0 }))}
                        className="w-28 border border-border bg-background px-3 py-2 text-right font-mono text-sm"
                      />
                      <span className="w-14 font-mono text-[10px] uppercase text-muted-foreground">{s.unit}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="mt-8 border border-border/60 bg-secondary/40 p-3 text-[11px] text-muted-foreground">
        <strong className="text-foreground">Developer note.</strong> Any new feature that spends or credits tokens must add its key to <code className="font-mono">platform_settings</code> and read the cost via <code className="font-mono">public.get_setting_num(&#39;key&#39;, default)</code>. It will then automatically appear in this panel.
      </div>
    </div>
  );
}
