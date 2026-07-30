import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminGetMatchingWeights, adminUpdateMatchingWeights } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/matching")({
  component: AdminMatchingPage,
});

const FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "sub_role_weight", label: "Sub-role & level", hint: "Sub-role match, weighted by seniority level" },
  { key: "skills_weight", label: "Skills", hint: "Requested skills possessed" },
  { key: "disciplines_weight", label: "Disciplines & Experience", hint: "Championship / discipline overlap" },
  { key: "day_rate_weight", label: "Day rate (EUR)", hint: "Rate vs budget" },
  { key: "languages_weight", label: "Languages", hint: "Level >= required" },
  { key: "education_weight", label: "Education", hint: "Study / motorsport academy" },
  { key: "location_weight", label: "Location", hint: "Geographic proximity" },
  { key: "calendar_freshness_weight", label: "Calendar freshness", hint: "Recent calendar confirmation (< 30 / 90 / 180 days)" },
];

function AdminMatchingPage() {
  const qc = useQueryClient();
  const load = useServerFn(adminGetMatchingWeights);
  const save = useServerFn(adminUpdateMatchingWeights);

  const { data } = useQuery({ queryKey: ["matching-weights"], queryFn: () => load() });
  const [values, setValues] = useState<Record<string, number>>({});
  // Seniority multipliers, edited as factors (0..1), stored as percentages
  const [factorX, setFactorX] = useState(0.5);
  const [factorY, setFactorY] = useState(0.25);

  useEffect(() => {
    if (data) {
      const d = data as any;
      setValues({
        sub_role_weight: Number(d.sub_role_weight ?? d.role_weight ?? 0),
        skills_weight: Number(d.skills_weight),
        disciplines_weight: Number(d.disciplines_weight),
        day_rate_weight: Number(d.day_rate_weight),
        languages_weight: Number(d.languages_weight),
        education_weight: Number(d.education_weight),
        location_weight: Number(d.location_weight),
        calendar_freshness_weight: Number(d.calendar_freshness_weight ?? 0),
      });
      setFactorX(Number(d.level_one_below_pct ?? 50) / 100);
      setFactorY(Number(d.level_two_below_pct ?? 25) / 100);
    }
  }, [data]);

  const total = Object.values(values).reduce((a, b) => a + (Number(b) || 0), 0);
  const validSum = Math.abs(total - 100) < 0.01;

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          ...values,
          level_one_below_pct: Math.max(0, Math.min(100, factorX * 100)),
          level_two_below_pct: Math.max(0, Math.min(100, factorY * 100)),
        } as any,
      }),
    onSuccess: () => {
      toast.success("Weights saved and matches recomputed");
      qc.invalidateQueries({ queryKey: ["matching-weights"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <div>
      <h2 className="mb-2 text-xl font-bold">Matching weights</h2>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Percentages that determine the match score. Hard filters (macro-role, hard sub-role, skills hard, dates, travel, hard languages, hard experience) still exclude non-matching candidates regardless of these weights. Weights must sum to <span className="font-bold">100</span>.
      </p>

      <div className="max-w-2xl grid gap-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="flex items-center justify-between gap-4 border border-border bg-card p-3">
              <div>
                <div className="font-bold">{f.label}</div>
                <div className="font-mono text-[11px] uppercase text-muted-foreground">{f.hint}</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={100}
                  value={values[f.key] ?? 0}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: parseFloat(e.target.value) || 0 }))}
                  className="w-24 border border-border bg-background px-3 py-2 text-right font-mono text-sm"
                />
                <span className="font-mono text-xs">%</span>
              </div>
            </label>

            {f.key === "sub_role_weight" && (
              <div className="ml-4 border-l-2 border-racing-red/40 pl-4 pt-3 grid gap-3">
                <p className="font-mono text-[11px] uppercase text-muted-foreground">
                  Seniority multipliers — same level or over-qualified = full weight
                </p>
                {[
                  { label: "Factor X — 1 level below", hint: "e.g. Intermediate required, Junior profile", value: factorX, set: setFactorX },
                  { label: "Factor Y — 2 levels below", hint: "e.g. Senior required, Junior profile", value: factorY, set: setFactorY },
                ].map((m) => (
                  <label key={m.label} className="flex items-center justify-between gap-4 border border-border bg-card p-3">
                    <div>
                      <div className="font-bold">{m.label}</div>
                      <div className="font-mono text-[11px] uppercase text-muted-foreground">{m.hint}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        max={1}
                        value={m.value}
                        onChange={(e) => m.set(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
                        className="w-24 border border-border bg-background px-3 py-2 text-right font-mono text-sm"
                      />
                      <span className="font-mono text-xs">×</span>
                    </div>
                  </label>
                ))}
                <div className="font-mono text-[11px] text-muted-foreground">
                  Effective: {(((values.sub_role_weight ?? 0) * factorX)).toFixed(2)}% (1 below) ·{" "}
                  {(((values.sub_role_weight ?? 0) * factorY)).toFixed(2)}% (2 below)
                </div>
              </div>
            )}
          </div>
        ))}

        <div className={`flex items-center justify-between border p-3 font-mono text-sm ${validSum ? "border-racing-yellow bg-racing-yellow/10 text-racing-yellow" : "border-racing-red bg-racing-red/10 text-racing-red"}`}>
          <span>Total</span>
          <span className="font-bold">{total.toFixed(2)}%</span>
        </div>

        <button
          disabled={!validSum || mut.isPending}
          onClick={() => mut.mutate()}
          className="mt-2 bg-racing-red px-4 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-40"
        >
          {mut.isPending ? "Saving…" : "Save & recompute all matches"}
        </button>
      </div>
    </div>
  );
}
