import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { adminListSettings, adminUpdateSettings } from "@/lib/admin.functions";
import { FLAG_KEYS } from "@/lib/flags.functions";
import { toastError } from "@/lib/errors";
import { PlatformCapacityCard } from "@/components/admin/platform-capacity-card";

export const Route = createFileRoute("/_authenticated/admin/launch")({
  component: AdminLaunchPage,
});

type Setting = { key: string; value_num: number; category: string };

function AdminLaunchPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useServerFn(adminListSettings);
  const save = useServerFn(adminUpdateSettings);
  const { data, isLoading } = useQuery({ queryKey: ["admin-settings"], queryFn: () => list() });

  const mut = useMutation({
    mutationFn: (u: { key: string; value_num: number }) => save({ data: { updates: [u] } }),
    onSuccess: () => {
      toast.success(t("sweep_admin_a.launch.saved"));
      qc.invalidateQueries();
    },
    onError: (e) => toastError(e, "sweep_admin_a.failed"),
  });

  const value = (key: string, fallback: boolean) => {
    const row = (data as Setting[] | undefined)?.find((s) => s.key === key);
    return row ? Number(row.value_num) > 0 : fallback;
  };

  const rows = [
    { key: FLAG_KEYS.comingSoon, fallback: false, title: t("sweep_admin_a.launch.coming_soon_title"), body: t("sweep_admin_a.launch.coming_soon_body") },
    { key: FLAG_KEYS.homeStats, fallback: true, title: t("sweep_admin_a.launch.home_stats_title"), body: t("sweep_admin_a.launch.home_stats_body") },
    { key: FLAG_KEYS.pitcallCreationDisabled, fallback: false, title: t("sweep_admin_a.launch.pitcall_off_title"), body: t("sweep_admin_a.launch.pitcall_off_body") },
  ];

  if (isLoading) return <div className="text-sm text-muted-foreground">{t("sweep_admin_a.loading")}</div>;

  return (
    <div className="grid gap-3">
      <div>
        <h2 className="text-lg font-black uppercase italic tracking-tighter">{t("sweep_admin_a.launch.title")}</h2>
        <p className="text-[11px] text-muted-foreground">{t("sweep_admin_a.launch.blurb")}</p>
      </div>
      <PlatformCapacityCard />
      {rows.map((r) => {
        const on = value(r.key, r.fallback);
        return (
          <div key={r.key} className="flex items-center justify-between gap-6 border border-border bg-card p-4">
            <div>
              <div className="text-sm font-bold uppercase tracking-widest">{r.title}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{r.body}</div>
            </div>
            <Switch
              checked={on}
              disabled={mut.isPending}
              onCheckedChange={(v) => mut.mutate({ key: r.key, value_num: v ? 1 : 0 })}
            />
          </div>
        );
      })}
    </div>
  );
}
