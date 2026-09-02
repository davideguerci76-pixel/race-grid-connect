import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  adminListSettings,
  adminUpdatePlatformRules,
  PLATFORM_RULE_BOUNDS,
  PLATFORM_RULE_KEYS,
} from "@/lib/admin.functions";
import { toastError } from "@/lib/errors";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/admin/platform-rules")({
  component: AdminPlatformRulesPage,
});

type Setting = {
  key: string;
  value_num: number;
  category: string;
  sort_order: number;
};

type RuleKey = (typeof PLATFORM_RULE_KEYS)[number];

const GROUPS: { id: "match_potential" | "request_modify" | "notifications" | "calendar"; keys: RuleKey[] }[] = [
  { id: "match_potential", keys: ["strong_match_threshold"] },
  {
    id: "request_modify",
    keys: [
      "max_modify_per_pitcall",
      "daily_recheck_budget",
      "red_cancel_budget_cost",
      "post_review_window_minutes",
    ],
  },
  { id: "notifications", keys: ["team_match_update_notification_hours"] },
  { id: "calendar", keys: ["availability_recompute_delay_minutes"] },
];

function AdminPlatformRulesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const list = useServerFn(adminListSettings);
  const save = useServerFn(adminUpdatePlatformRules);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-platform-rules"],
    queryFn: () => list(),
  });
  const [values, setValues] = useState<Partial<Record<RuleKey, number>>>({});

  useEffect(() => {
    if (!data) return;
    const next: Partial<Record<RuleKey, number>> = {};
    for (const setting of data as Setting[]) {
      if (PLATFORM_RULE_KEYS.includes(setting.key as RuleKey)) {
        next[setting.key as RuleKey] = Number(setting.value_num);
      }
    }
    setValues(next);
  }, [data]);

  const rows = useMemo(() => (data ?? []) as Setting[], [data]);
  const dirty = useMemo(
    () =>
      PLATFORM_RULE_KEYS.flatMap((key) => {
        const current = values[key];
        const original = rows.find((row) => row.key === key)?.value_num;
        return current !== undefined && original !== undefined && current !== Number(original)
          ? [{ key, value_num: current }]
          : [];
      }),
    [rows, values],
  );

  const mutation = useMutation({
    mutationFn: () => save({ data: { updates: dirty } }),
    onSuccess: () => {
      toast.success(t("sweep_admin_b.platform_rules.saved"));
      queryClient.invalidateQueries({ queryKey: ["admin-platform-rules"] });
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
    },
    onError: (error) => toastError(error, "sweep_admin_b.common.save_failed"),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t("sweep_admin_b.common.loading")}</div>;
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-black uppercase italic tracking-tighter">
            {t("sweep_admin_b.platform_rules.title")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("sweep_admin_b.platform_rules.description")}
          </p>
        </div>
        <Button
          type="button"
          disabled={dirty.length === 0 || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="rounded-none bg-racing-red px-4 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110"
        >
          {mutation.isPending
            ? t("sweep_admin_b.common.saving")
            : dirty.length > 0
              ? t("sweep_admin_b.platform_rules.save_changes_count", { count: dirty.length })
              : t("sweep_admin_b.platform_rules.save_changes")}
        </Button>
      </div>

      <div className="grid gap-8">
        {GROUPS.map((group) => (
          <section key={group.id}>
            <div className="mb-3">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-racing-yellow">
                {t(`sweep_admin_b.platform_rules.groups.${group.id}`)}
              </h3>
            </div>
            <div className="grid gap-2">
              {group.keys.map((key) => {
                const setting = rows.find((row) => row.key === key);
                const bounds = PLATFORM_RULE_BOUNDS[key];
                const value = values[key] ?? Number(setting?.value_num ?? 0);
                const changed = setting !== undefined && value !== Number(setting.value_num);
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between gap-4 border p-4 ${
                      changed ? "border-racing-red bg-racing-red/5" : "border-border bg-card"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold">{t(`sweep_admin_b.platform_rules.fields.${key}.label`)}</div>
                      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {t(`sweep_admin_b.platform_rules.fields.${key}.description`)}
                      </div>
                      <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        {key} · {t("sweep_admin_b.platform_rules.range", { min: bounds.min, max: bounds.max })}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <input
                        aria-label={t(`sweep_admin_b.platform_rules.fields.${key}.label`)}
                        type="number"
                        inputMode="numeric"
                        step={1}
                        min={bounds.min}
                        max={bounds.max}
                        value={value}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          setValues((previous) => ({ ...previous, [key]: Number.isFinite(next) ? next : 0 }));
                        }}
                        className="w-24 border border-border bg-background px-3 py-2 text-right font-mono text-sm"
                      />
                      <span className="w-16 font-mono text-[10px] uppercase text-muted-foreground">
                        {setting?.category === "match_potential"
                          ? t("sweep_admin_b.platform_rules.units.matches")
                          : t(`sweep_admin_b.platform_rules.units.${key}`)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
