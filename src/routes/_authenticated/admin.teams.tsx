import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { adminListTeams, adminSetTokens, adminSetBlocked, adminDeleteUser } from "@/lib/admin.functions";
import { exportToExcel } from "@/lib/export-xlsx";
import { useSort, Th } from "@/lib/use-sort";
import { RatingIcons } from "@/components/rating-icons";

export const Route = createFileRoute("/_authenticated/admin/teams")({
  component: AdminTeams,
});

function AdminTeams() {
  const { t } = useTranslation();
  const list = useServerFn(adminListTeams);
  const setTokens = useServerFn(adminSetTokens);
  const setBlocked = useServerFn(adminSetBlocked);
  const delUser = useServerFn(adminDeleteUser);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-teams"], queryFn: () => list() });
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((r: any) => {
      if (!s) return true;
      return [r.display_name, r.email, r.team?.team_name, r.team?.location, r.team?.primary_discipline]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(s));
    });
  }, [data, q]);

  const { sorted, toggle, indicator } = useSort<any>(rows);

  async function onEditTokens(user_id: string, current: number) {
    const v = prompt(t("sweep_admin_a.freelancers.new_token_balance"), String(current));
    if (v == null) return;
    const n = parseInt(v);
    if (isNaN(n) || n < 0) return toast.error(t("sweep_admin_a.invalid_number"));
    try {
      await setTokens({ data: { user_id, balance: n } });
      toast.success(t("sweep_admin_a.tokens_updated"));
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function onToggleBlock(user_id: string, blocked: boolean) {
    if (!confirm(blocked ? t("sweep_admin_a.confirm_unblock") : t("sweep_admin_a.confirm_block"))) return;
    try {
      await setBlocked({ data: { user_id, blocked: !blocked } });
      toast.success(blocked ? t("sweep_admin_a.unblocked") : t("sweep_admin_a.blocked"));
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function onDelete(user_id: string, name: string) {
    if (!confirm(t("sweep_admin_a.confirm_delete", { name }))) return;
    try {
      await delUser({ data: { user_id } });
      toast.success(t("sweep_admin_a.user_deleted"));
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("sweep_admin_a.teams.search_placeholder")}
          className="min-w-[220px] flex-1 border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={() =>
            exportToExcel("teams", "Teams", rows.map((r: any) => ({
              Team: r.team?.team_name ?? r.display_name,
              Contact: r.display_name,
              Email: r.email ?? "",
              Discipline: r.team?.primary_discipline ?? "",
              Location: r.team?.location ?? "",
              Website: r.team?.website ?? "",
              Tokens: r.token_balance,
              Status: r.blocked_at ? "Blocked" : "Active",
              Roles: (r.roles ?? []).join(", "),
              CreatedAt: r.created_at,
            })))
          }
          className="border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest hover:bg-secondary"
        >
          {t("sweep_admin_a.export_to_excel")}
        </button>
        <div className="ml-auto text-xs text-muted-foreground self-center">{t("sweep_admin_a.teams.count", { count: rows.length })}</div>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("sweep_admin_a.loading")}</div>
      ) : (
        <div className="overflow-auto border border-border">
          <table className="w-full min-w-[1100px] text-xs">
            <thead className="bg-secondary text-[10px] font-bold uppercase tracking-widest">
              <tr>
                <Th onClick={() => toggle("team.team_name")} label={`${t("sweep_admin_a.columns.team")}${indicator("team.team_name")}`} />
                <Th onClick={() => toggle("display_name")} label={`${t("sweep_admin_a.columns.contact")}${indicator("display_name")}`} />
                <Th onClick={() => toggle("email")} label={`${t("sweep_admin_a.columns.email")}${indicator("email")}`} />
                <Th onClick={() => toggle("team.primary_discipline")} label={`${t("sweep_admin_a.columns.discipline")}${indicator("team.primary_discipline")}`} />
                <Th onClick={() => toggle("team.location")} label={`${t("sweep_admin_a.columns.location")}${indicator("team.location")}`} />
                <Th onClick={() => toggle("team.website")} label={`${t("sweep_admin_a.columns.website")}${indicator("team.website")}`} />
                <Th onClick={() => toggle("rating_avg")} label={`${t("sweep_admin_a.columns.rating")}${indicator("rating_avg")}`} />
                <Th onClick={() => toggle("token_balance")} label={`${t("sweep_admin_a.columns.tokens")}${indicator("token_balance")}`} align="right" />
                <Th onClick={() => toggle("blocked_at")} label={`${t("sweep_admin_a.columns.status")}${indicator("blocked_at")}`} />
                <th className="px-2 py-2 text-right">{t("sweep_admin_a.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r: any) => (
                <tr key={r.id} className="border-t border-border/60 hover:bg-secondary/40">
                  <td className="px-2 py-2 font-bold">{r.team?.team_name ?? r.display_name}</td>
                  <td className="px-2 py-2">{r.display_name}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.email}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.team?.primary_discipline ?? "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.team?.location ?? "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.team?.website ?? "—"}</td>
                  <td className="px-2 py-2">
                    {r.rating_count > 0 ? (
                      <RatingIcons variant="headset" value={r.rating_avg} count={r.rating_count} size={14} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-bold">{r.token_balance}</td>
                  <td className="px-2 py-2">
                    {r.blocked_at ? <span className="text-racing-red">{t("sweep_admin_a.status.blocked")}</span> : <span className="text-emerald-500">{t("sweep_admin_a.status.active")}</span>}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <a href={`/teams/${r.id}`} target="_blank" rel="noreferrer" className="border border-border px-2 py-1 text-[10px] font-bold uppercase hover:bg-secondary">{t("sweep_admin_a.actions.view")}</a>
                      <button onClick={() => onEditTokens(r.id, r.token_balance)} className="border border-border px-2 py-1 text-[10px] font-bold uppercase hover:bg-secondary">{t("sweep_admin_a.actions.tokens")}</button>
                      {(r.email ?? "").toLowerCase() !== "davideguerci76@gmail.com" && (
                        <>
                          <button onClick={() => onToggleBlock(r.id, !!r.blocked_at)} className="border border-border px-2 py-1 text-[10px] font-bold uppercase hover:bg-secondary">
                            {r.blocked_at ? t("sweep_admin_a.actions.unblock") : t("sweep_admin_a.actions.block")}
                          </button>
                          <button onClick={() => onDelete(r.id, r.team?.team_name ?? r.display_name)} className="border border-racing-red px-2 py-1 text-[10px] font-bold uppercase text-racing-red hover:bg-racing-red/10">{t("sweep_admin_a.actions.delete")}</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
