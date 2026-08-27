import { confirmDialog } from "@/hooks/use-confirm";
import { toastError } from "@/lib/errors";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { adminListFreelancers, adminListTeams, adminSetAdminRole } from "@/lib/admin.functions";
import { exportToExcel } from "@/lib/export-xlsx";
import { useSort, Th } from "@/lib/use-sort";

export const Route = createFileRoute("/_authenticated/admin/permissions")({
  component: AdminPermissions,
});

function AdminPermissions() {
  const { t } = useTranslation();
  const listF = useServerFn(adminListFreelancers);
  const listT = useServerFn(adminListTeams);
  const setAdmin = useServerFn(adminSetAdminRole);
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data: fs } = useQuery({ queryKey: ["admin-freelancers"], queryFn: () => listF() });
  const { data: ts } = useQuery({ queryKey: ["admin-teams"], queryFn: () => listT() });

  const all = useMemo(() => [...(fs ?? []), ...(ts ?? [])], [fs, ts]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((r: any) => [r.display_name, r.email].filter(Boolean).some((v: string) => String(v).toLowerCase().includes(s)));
  }, [all, q]);

  const { sorted, toggle, indicator } = useSort<any>(rows);

  async function onToggle(user_id: string, isAdmin: boolean, name: string) {
    if (!await confirmDialog(isAdmin ? t("sweep_admin_a.permissions.confirm_revoke", { name }) : t("sweep_admin_a.permissions.confirm_grant", { name }))) return;
    try {
      await setAdmin({ data: { user_id, is_admin: !isAdmin } });
      toast.success(t("sweep_admin_a.permissions.role_updated"));
      qc.invalidateQueries({ queryKey: ["admin-freelancers"] });
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
    } catch (e: any) {
      toastError(e);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("sweep_admin_a.permissions.search_placeholder")}
          className="min-w-[220px] flex-1 border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={() =>
            exportToExcel("permissions", "Users", rows.map((r: any) => ({
              Name: r.display_name,
              Email: r.email ?? "",
              Type: r.user_type,
              Roles: (r.roles ?? []).join(", ") || "user",
              IsAdmin: (r.roles ?? []).includes("admin") ? "Yes" : "No",
            })))
          }
          className="border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest hover:bg-secondary"
        >
          {t("sweep_admin_a.export_to_excel")}
        </button>
        <div className="ml-auto text-xs text-muted-foreground self-center">{t("sweep_admin_a.permissions.count", { count: rows.length })}</div>
      </div>
      <div className="overflow-auto border border-border">
        <table className="w-full min-w-[800px] text-xs">
          <thead className="bg-secondary text-[10px] font-bold uppercase tracking-widest">
            <tr>
              <Th onClick={() => toggle("display_name")} label={`${t("sweep_admin_a.columns.name")}${indicator("display_name")}`} />
              <Th onClick={() => toggle("email")} label={`${t("sweep_admin_a.columns.email")}${indicator("email")}`} />
              <Th onClick={() => toggle("user_type")} label={`${t("sweep_admin_a.columns.type")}${indicator("user_type")}`} />
              <Th onClick={() => toggle("roles")} label={`${t("sweep_admin_a.columns.roles")}${indicator("roles")}`} />
              <th className="px-2 py-2 text-right">{t("sweep_admin_a.columns.action")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r: any) => {
              const isAdmin = (r.roles ?? []).includes("admin");
              const isPrimary = (r.email ?? "").toLowerCase() === "davideguerci76@gmail.com";
              return (
                <tr key={r.id} className="border-t border-border/60 hover:bg-secondary/40">
                  <td className="px-2 py-2">{r.display_name}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.email}</td>
                  <td className="px-2 py-2">{r.user_type}</td>
                  <td className="px-2 py-2">
                    {isAdmin ? <span className="font-bold text-racing-red">{t("sweep_admin_a.permissions.admin_badge")}</span> : <span className="text-muted-foreground">{t("sweep_admin_a.permissions.user_badge")}</span>}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {isAdmin && isPrimary ? (
                      <span className="text-[10px] uppercase text-muted-foreground">{t("sweep_admin_a.permissions.primary_admin")}</span>
                    ) : (
                      <button
                        onClick={() => onToggle(r.id, isAdmin, r.display_name)}
                        className={`border px-2 py-1 text-[10px] font-bold uppercase ${
                          isAdmin ? "border-border hover:bg-secondary" : "border-racing-red text-racing-red hover:bg-racing-red/10"
                        }`}
                      >
                        {isAdmin ? t("sweep_admin_a.permissions.revoke_admin") : t("sweep_admin_a.permissions.grant_admin")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
