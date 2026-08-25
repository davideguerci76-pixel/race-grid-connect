import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Users, X } from "lucide-react";
import {
  adminListTeams,
  adminSetBlocked,
  adminDeleteUser,
  adminUpdateTeam,
  adminGetTeamPool,
} from "@/lib/admin.functions";
import { exportToExcel } from "@/lib/export-xlsx";
import { useSort, Th } from "@/lib/use-sort";
import { RatingIcons } from "@/components/rating-icons";

export const Route = createFileRoute("/_authenticated/admin/teams")({
  component: AdminTeams,
});

type Draft = Record<string, string>;

function AdminTeams() {
  const { t } = useTranslation();
  const list = useServerFn(adminListTeams);
  const setBlocked = useServerFn(adminSetBlocked);
  const delUser = useServerFn(adminDeleteUser);
  const updateFn = useServerFn(adminUpdateTeam);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-teams"], queryFn: () => list() });
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [poolTeam, setPoolTeam] = useState<{ id: string; name: string } | null>(null);

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

  function draftValue(r: any, key: string, current: any) {
    const d = drafts[r.id]?.[key];
    return d !== undefined ? d : current == null ? "" : String(current);
  }
  function setDraft(id: string, key: string, value: string) {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [key]: value } }));
  }

  async function onSaveRow(r: any) {
    const d = drafts[r.id];
    if (!d) return;
    const payload: any = { user_id: r.id };
    if (d["display_name"] !== undefined) payload.display_name = d["display_name"];
    if (d["team_name"] !== undefined) payload.team_name = d["team_name"];
    if (d["primary_discipline"] !== undefined) payload.primary_discipline = d["primary_discipline"] || null;
    if (d["location"] !== undefined) payload.location = d["location"] || null;
    if (d["website"] !== undefined) payload.website = d["website"] || null;
    if (d["vat_number"] !== undefined) payload.vat_number = d["vat_number"] || null;
    if (d["size"] !== undefined) payload.size = d["size"] || null;
    if (d["token_balance"] !== undefined) payload.token_balance = parseInt(d["token_balance"] || "0");
    if (Number.isNaN(payload.token_balance)) return toast.error(t("sweep_admin_a.invalid_number"));
    setSaving(r.id);
    try {
      await updateFn({ data: payload });
      toast.success(t("sweep_admin_a.saved", { defaultValue: "Saved" }));
      setDrafts((prev) => {
        const n = { ...prev };
        delete n[r.id];
        return n;
      });
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(null);
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

  const inputCls = "w-full min-w-[90px] border border-border/60 bg-background px-1.5 py-1 text-xs focus:border-racing-red focus:outline-none";

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
              VAT: r.team?.vat_number ?? "",
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
          <table className="w-full min-w-[1600px] text-xs">
            <thead className="bg-secondary text-[10px] font-bold uppercase tracking-widest">
              <tr>
                <Th onClick={() => toggle("team.team_name")} label={`${t("sweep_admin_a.columns.team")}${indicator("team.team_name")}`} />
                <Th onClick={() => toggle("display_name")} label={`${t("sweep_admin_a.columns.contact")}${indicator("display_name")}`} />
                <Th onClick={() => toggle("email")} label={`${t("sweep_admin_a.columns.email")}${indicator("email")}`} />
                <Th onClick={() => toggle("team.primary_discipline")} label={`${t("sweep_admin_a.columns.discipline")}${indicator("team.primary_discipline")}`} />
                <Th onClick={() => toggle("team.location")} label={`${t("sweep_admin_a.columns.location")}${indicator("team.location")}`} />
                <Th onClick={() => toggle("team.website")} label={`${t("sweep_admin_a.columns.website")}${indicator("team.website")}`} />
                <th className="px-2 py-2 text-left">VAT</th>
                <th className="px-2 py-2 text-left">Pool</th>
                <Th onClick={() => toggle("rating_avg")} label={`${t("sweep_admin_a.columns.rating")}${indicator("rating_avg")}`} />
                <Th onClick={() => toggle("token_balance")} label={`${t("sweep_admin_a.columns.tokens")}${indicator("token_balance")}`} align="right" />
                <Th onClick={() => toggle("blocked_at")} label={`${t("sweep_admin_a.columns.status")}${indicator("blocked_at")}`} />
                <th className="px-2 py-2 text-right">{t("sweep_admin_a.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r: any) => {
                const dirty = !!drafts[r.id] && Object.keys(drafts[r.id]!).length > 0;
                return (
                  <tr key={r.id} className={`border-t border-border/60 align-top ${dirty ? "bg-racing-yellow/5" : "hover:bg-secondary/40"}`}>
                    <td className="px-2 py-2">
                      <input className={`${inputCls} font-bold`} value={draftValue(r, "team_name", r.team?.team_name ?? r.display_name)} onChange={(e) => setDraft(r.id, "team_name", e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <input className={inputCls} value={draftValue(r, "display_name", r.display_name)} onChange={(e) => setDraft(r.id, "display_name", e.target.value)} />
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{r.email}</td>
                    <td className="px-2 py-2">
                      <input className={inputCls} value={draftValue(r, "primary_discipline", r.team?.primary_discipline)} onChange={(e) => setDraft(r.id, "primary_discipline", e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <input className={inputCls} value={draftValue(r, "location", r.team?.location)} onChange={(e) => setDraft(r.id, "location", e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <input className={inputCls} value={draftValue(r, "website", r.team?.website)} onChange={(e) => setDraft(r.id, "website", e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <input className={inputCls} value={draftValue(r, "vat_number", r.team?.vat_number)} onChange={(e) => setDraft(r.id, "vat_number", e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => setPoolTeam({ id: r.id, name: r.team?.team_name ?? r.display_name })}
                        className="inline-flex items-center gap-1 border border-racing-yellow px-2 py-1 font-mono text-[10px] font-bold uppercase text-racing-yellow hover:bg-racing-yellow/10"
                      >
                        <Users className="size-3" /> Pool
                      </button>
                    </td>
                    <td className="px-2 py-2">
                      {r.rating_count > 0 ? (
                        <RatingIcons variant="headset" value={r.rating_avg} count={r.rating_count} size={14} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" className={`${inputCls} w-20 min-w-0 text-right font-bold`} value={draftValue(r, "token_balance", r.token_balance)} onChange={(e) => setDraft(r.id, "token_balance", e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      {r.blocked_at ? <span className="text-racing-red">{t("sweep_admin_a.status.blocked")}</span> : <span className="text-emerald-500">{t("sweep_admin_a.status.active")}</span>}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          onClick={() => onSaveRow(r)}
                          disabled={!dirty || saving === r.id}
                          className="border border-emerald-500 px-2 py-1 text-[10px] font-bold uppercase text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-40"
                        >
                          {saving === r.id ? "…" : t("sweep_admin_a.actions.save_changes", { defaultValue: "Save changes" })}
                        </button>
                        <a href={`/teams/${r.id}`} target="_blank" rel="noreferrer" className="border border-border px-2 py-1 text-[10px] font-bold uppercase hover:bg-secondary">{t("sweep_admin_a.actions.view")}</a>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {poolTeam && <PoolModal teamId={poolTeam.id} teamName={poolTeam.name} onClose={() => setPoolTeam(null)} />}
    </div>
  );
}

function PoolModal({ teamId, teamName, onClose }: { teamId: string; teamName: string; onClose: () => void }) {
  const poolFn = useServerFn(adminGetTeamPool);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-team-pool", teamId],
    queryFn: () => poolFn({ data: { team_id: teamId } }),
  });
  const rows = (data ?? []) as any[];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/70 p-4" onClick={onClose}>
      <div className="mt-10 w-full max-w-4xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-racing-red">[MY POOL]</div>
            <h2 className="text-xl font-black uppercase italic tracking-tighter">{teamName}</h2>
            <p className="text-xs text-muted-foreground">{rows.length} freelancer(s) in pool</p>
          </div>
          <button onClick={onClose} className="border border-border p-1 hover:bg-secondary"><X className="size-4" /></button>
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Pool is empty.</div>
        ) : (
          <div className="overflow-auto border border-border">
            <table className="w-full min-w-[800px] text-xs">
              <thead className="bg-secondary text-[10px] font-bold uppercase tracking-widest">
                <tr>
                  <th className="px-2 py-2 text-left">Pit Code</th>
                  <th className="px-2 py-2 text-left">First name</th>
                  <th className="px-2 py-2 text-left">Last name</th>
                  <th className="px-2 py-2 text-left">Phone</th>
                  <th className="px-2 py-2 text-left">Email</th>
                  <th className="px-2 py-2 text-left">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-t border-border/60">
                    <td className="px-2 py-2 font-mono font-bold text-racing-yellow">{m.pit_code ?? "—"}</td>
                    <td className="px-2 py-2">{m.first_name ?? (m.display_name ?? "").split(" ")[0] ?? "—"}</td>
                    <td className="px-2 py-2">{m.last_name ?? (m.display_name ?? "").split(" ").slice(1).join(" ") || "—"}</td>
                    <td className="px-2 py-2 font-mono">{m.phone ?? "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{m.email ?? "—"}</td>
                    <td className="px-2 py-2 font-mono text-[10px] uppercase text-muted-foreground">{m.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
