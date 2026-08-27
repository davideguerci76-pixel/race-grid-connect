import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminGetMatchingWeights, adminUpdateMatchingWeights } from "@/lib/admin.functions";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/admin/matching")({
  component: AdminMatchingPage,
});

const FIELD_KEYS = [
  "sub_role_weight",
  "skills_weight",
  "disciplines_weight",
  "day_rate_weight",
  "languages_weight",
  "education_weight",
  "location_weight",
] as const;

function AdminMatchingPage() {
  const { t } = useTranslation();
  const FIELDS = FIELD_KEYS.map((key) => ({
    key,
    label: t(`sweep_admin_b.matching.field_${key}_label`),
    hint: t(`sweep_admin_b.matching.field_${key}_hint`),
  }));
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
      toast.success(t("sweep_admin_b.matching.saved"));
      qc.invalidateQueries({ queryKey: ["matching-weights"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_admin_b.common.save_failed")),
  });

  return (
    <div>
      <h2 className="mb-2 text-xl font-bold">{t("sweep_admin_b.matching.title")}</h2>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        {t("sweep_admin_b.matching.description")} <span className="font-bold">100</span>.
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
                  {t("sweep_admin_b.matching.seniority_multipliers")}
                </p>
                {[
                  { label: t("sweep_admin_b.matching.factor_x_label"), hint: t("sweep_admin_b.matching.factor_x_hint"), value: factorX, set: setFactorX },
                  { label: t("sweep_admin_b.matching.factor_y_label"), hint: t("sweep_admin_b.matching.factor_y_hint"), value: factorY, set: setFactorY },
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
                  {t("sweep_admin_b.matching.effective_one_below", { value: (((values.sub_role_weight ?? 0) * factorX)).toFixed(2) })} ·{" "}
                  {t("sweep_admin_b.matching.effective_two_below", { value: (((values.sub_role_weight ?? 0) * factorY)).toFixed(2) })}
                </div>
              </div>
            )}
          </div>
        ))}

        <div className={`flex items-center justify-between border p-3 font-mono text-sm ${validSum ? "border-racing-yellow bg-racing-yellow/10 text-racing-yellow" : "border-racing-red bg-racing-red/10 text-racing-red"}`}>
          <span>{t("sweep_admin_b.matching.total")}</span>
          <span className="font-bold">{total.toFixed(2)}%</span>
        </div>

        <button
          disabled={!validSum || mut.isPending}
          onClick={() => mut.mutate()}
          className="mt-2 bg-racing-red px-4 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-40"
        >
          {mut.isPending ? t("sweep_admin_b.common.saving") : t("sweep_admin_b.matching.save_button")}
        </button>
      </div>
    </div>
  );
}
