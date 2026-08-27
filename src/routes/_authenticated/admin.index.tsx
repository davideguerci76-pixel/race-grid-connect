import { toastError } from "@/lib/errors";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  adminListFreelancers,
  adminSetBlocked,
  adminDeleteUser,
  adminUpdateFreelancer,
  adminMarketPrivateStats,
} from "@/lib/admin.functions";
import { exportToExcel } from "@/lib/export-xlsx";
import { useSort, Th } from "@/lib/use-sort";
import { RatingIcons } from "@/components/rating-icons";
import { AdminUserActions } from "@/components/admin-user-actions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminFreelancers,
});

type Draft = Record<string, string>;

function AdminFreelancers() {
  const { t } = useTranslation();
  const list = useServerFn(adminListFreelancers);
  const setBlocked = useServerFn(adminSetBlocked);
  const delUser = useServerFn(adminDeleteUser);
  const updateFn = useServerFn(adminUpdateFreelancer);
  const privateStatsFn = useServerFn(adminMarketPrivateStats);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-freelancers"], queryFn: () => list() });
  const { data: rateStats } = useQuery({ queryKey: ["admin-private-stats"], queryFn: () => privateStatsFn() });
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((r: any) => {
      if (role && r.freelancer?.role_group !== role) return false;
      if (!s) return true;
      return [r.display_name, r.email, r.freelancer?.pit_code, r.freelancer?.role_group, r.freelancer?.location, ...(r.freelancer?.skills ?? [])]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(s));
    });
  }, [data, q, role]);

  const roles = useMemo(
    () => Array.from(new Set((data ?? []).map((r: any) => r.freelancer?.role_group).filter(Boolean))).sort(),
    [data],
  );

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
    if (d["headline"] !== undefined) payload.headline = d["headline"] || null;
    if (d["role_group"] !== undefined) payload.role_group = d["role_group"] || null;
    if (d["location"] !== undefined) payload.location = d["location"] || null;
    if (d["education"] !== undefined) payload.education = d["education"] || null;
    if (d["disciplines"] !== undefined)
      payload.disciplines = d["disciplines"].split(",").map((x) => x.trim()).filter(Boolean);
    if (d["skills"] !== undefined) payload.skills = d["skills"].split(",").map((x) => x.trim()).filter(Boolean);
    if (d["day_rate"] !== undefined) payload.day_rate = d["day_rate"] === "" ? null : parseInt(d["day_rate"]);
    if (d["years_experience"] !== undefined)
      payload.years_experience = d["years_experience"] === "" ? null : parseInt(d["years_experience"]);
    if (d["token_balance"] !== undefined) payload.token_balance = parseInt(d["token_balance"] || "0");
    if (d["phone_dial_code"] !== undefined) payload.phone_dial_code = d["phone_dial_code"] || null;
    if (d["phone_number"] !== undefined) payload.phone_number = d["phone_number"] || null;
    if (Number.isNaN(payload.day_rate) || Number.isNaN(payload.token_balance) || Number.isNaN(payload.years_experience)) {
      return toast.error(t("sweep_admin_a.invalid_number"));
    }
    setSaving(r.id);
    try {
      await updateFn({ data: payload });
      toast.success(t("sweep_admin_a.saved", { defaultValue: "Saved" }));
      setDrafts((prev) => {
        const n = { ...prev };
        delete n[r.id];
        return n;
      });
      qc.invalidateQueries({ queryKey: ["admin-freelancers"] });
    } catch (e: any) {
      toastError(e);
    } finally {
      setSaving(null);
    }
  }

  async function onToggleBlock(user_id: string, blocked: boolean) {
    if (!confirm(blocked ? t("sweep_admin_a.confirm_unblock") : t("sweep_admin_a.confirm_block"))) return;
    try {
      await setBlocked({ data: { user_id, blocked: !blocked } });
      toast.success(blocked ? t("sweep_admin_a.unblocked") : t("sweep_admin_a.blocked"));
      qc.invalidateQueries({ queryKey: ["admin-freelancers"] });
    } catch (e: any) {
      toastError(e);
    }
  }

  async function onDelete(user_id: string, name: string) {
    if (!confirm(t("sweep_admin_a.confirm_delete", { name }))) return;
    try {
      await delUser({ data: { user_id } });
      toast.success(t("sweep_admin_a.user_deleted"));
      qc.invalidateQueries({ queryKey: ["admin-freelancers"] });
    } catch (e: any) {
      toastError(e);
    }
  }

  const inputCls = "w-full min-w-[90px] border border-border/60 bg-background px-1.5 py-1 text-xs focus:border-racing-red focus:outline-none";

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Average day rate", rateStats?.avg_day_rate],
          ["Median day rate", rateStats?.median_day_rate],
          ["Min day rate", rateStats?.min_day_rate],
          ["Max day rate", rateStats?.max_day_rate],
        ].map(([label, v]) => (
          <div key={String(label)} className="border border-racing-red/40 bg-racing-red/5 p-3">
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-racing-red">
              {String(label)} · admin only
            </div>
            <div className="mt-1 font-mono text-2xl font-black tracking-tighter">
              {v == null ? "—" : `€ ${v}`}
            </div>
          </div>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("sweep_admin_a.freelancers.search_placeholder")}
          className="min-w-[220px] flex-1 border border-border bg-background px-3 py-2 text-sm"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="border border-border bg-background px-3 py-2 text-sm">
          <option value="">{t("sweep_admin_a.freelancers.all_roles")}</option>
          {roles.map((r: any) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button
          onClick={() =>
            exportToExcel("freelancers", "Freelancers", rows.map((r: any) => ({
              Name: r.display_name,
              PitCode: r.freelancer?.pit_code ?? "",
              Email: r.email ?? "",
              Role: r.freelancer?.role_group ?? "",
              Disciplines: (r.freelancer?.disciplines ?? []).join(", "),
              Skills: (r.freelancer?.skills ?? []).join(", "),
              Languages: (r.freelancer?.languages ?? []).map((l: any) => `${l.code === "other" ? (l.custom || "Other") : l.code}(${l.level})`).join(", "),
              Education: r.freelancer?.education ?? "",
              Location: r.freelancer?.location ?? "",
              Phone: r.freelancer?.phone_number ? `${r.freelancer?.phone_dial_code ?? ""} ${r.freelancer?.phone_number}`.trim() : "",
              DayRate: r.freelancer?.day_rate ?? "",
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
        <div className="ml-auto text-xs text-muted-foreground self-center">{t("sweep_admin_a.freelancers.count", { count: rows.length })}</div>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("sweep_admin_a.loading")}</div>
      ) : (
        <div className="overflow-auto border border-border">
          <table className="w-full min-w-[1700px] text-xs">
            <thead className="bg-secondary text-[10px] font-bold uppercase tracking-widest">
              <tr>
                <Th onClick={() => toggle("freelancer.pit_code")} label={`Pit Code${indicator("freelancer.pit_code")}`} />
                <Th onClick={() => toggle("display_name")} label={`${t("sweep_admin_a.columns.name")}${indicator("display_name")}`} />
                <Th onClick={() => toggle("email")} label={`${t("sweep_admin_a.columns.email")}${indicator("email")}`} />
                <Th onClick={() => toggle("freelancer.role_group")} label={`${t("sweep_admin_a.columns.macro_role")}${indicator("freelancer.role_group")}`} />
                <Th onClick={() => toggle("freelancer.disciplines")} label={`${t("sweep_admin_a.columns.disciplines")}${indicator("freelancer.disciplines")}`} />
                <Th onClick={() => toggle("freelancer.skills")} label={`${t("sweep_admin_a.columns.skills")}${indicator("freelancer.skills")}`} />
                <th className="px-2 py-2 text-left">{t("sweep_admin_a.columns.languages")}</th>
                <Th onClick={() => toggle("freelancer.location")} label={`${t("sweep_admin_a.columns.location")}${indicator("freelancer.location")}`} />
                <Th onClick={() => toggle("freelancer.phone_number")} label={`${t("sweep_admin_a.columns.phone")}${indicator("freelancer.phone_number")}`} />
                <Th onClick={() => toggle("freelancer.day_rate")} label={`${t("sweep_admin_a.columns.rate")}${indicator("freelancer.day_rate")}`} align="right" />
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
                    <td className="px-2 py-2 font-mono font-bold text-racing-yellow">{r.freelancer?.pit_code ?? "—"}</td>
                    <td className="px-2 py-2">
                      <input className={inputCls} value={draftValue(r, "display_name", r.display_name)} onChange={(e) => setDraft(r.id, "display_name", e.target.value)} />
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{r.email}</td>
                    <td className="px-2 py-2">
                      <input className={inputCls} value={draftValue(r, "role_group", r.freelancer?.role_group)} onChange={(e) => setDraft(r.id, "role_group", e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <input className={inputCls} value={draftValue(r, "disciplines", (r.freelancer?.disciplines ?? []).join(", "))} onChange={(e) => setDraft(r.id, "disciplines", e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <input className={inputCls} value={draftValue(r, "skills", (r.freelancer?.skills ?? []).join(", "))} onChange={(e) => setDraft(r.id, "skills", e.target.value)} />
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {(r.freelancer?.languages ?? []).map((l: any) => `${l.code === "other" ? (l.custom || "Other") : l.code}(${l.level?.[0] ?? "?"})`).join(", ") || "—"}
                    </td>
                    <td className="px-2 py-2">
                      <input className={inputCls} value={draftValue(r, "location", r.freelancer?.location)} onChange={(e) => setDraft(r.id, "location", e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <input className={`${inputCls} w-14 min-w-0`} value={draftValue(r, "phone_dial_code", r.freelancer?.phone_dial_code)} onChange={(e) => setDraft(r.id, "phone_dial_code", e.target.value)} />
                        <input className={inputCls} value={draftValue(r, "phone_number", r.freelancer?.phone_number)} onChange={(e) => setDraft(r.id, "phone_number", e.target.value)} />
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" className={`${inputCls} w-20 min-w-0 text-right`} value={draftValue(r, "day_rate", r.freelancer?.day_rate)} onChange={(e) => setDraft(r.id, "day_rate", e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      {r.rating_count > 0 ? (
                        <RatingIcons variant="wrench" value={r.rating_avg} count={r.rating_count} size={14} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" className={`${inputCls} w-20 min-w-0 text-right font-bold`} value={draftValue(r, "token_balance", r.token_balance)} onChange={(e) => setDraft(r.id, "token_balance", e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      {r.blocked_at ? (
                        <span className="text-racing-red">{t("sweep_admin_a.status.blocked")}</span>
                      ) : (
                        <span className="text-emerald-500">{t("sweep_admin_a.status.active")}</span>
                      )}
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
                        <a
                          href={`/freelancers/${r.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="border border-border px-2 py-1 text-[10px] font-bold uppercase hover:bg-secondary"
                        >
                          {t("sweep_admin_a.actions.view")}
                        </a>
                        {(r.email ?? "").toLowerCase() !== "davideguerci76@gmail.com" && (
                          <>
                            <button onClick={() => onToggleBlock(r.id, !!r.blocked_at)} className="border border-border px-2 py-1 text-[10px] font-bold uppercase hover:bg-secondary">
                              {r.blocked_at ? t("sweep_admin_a.actions.unblock") : t("sweep_admin_a.actions.block")}
                            </button>
                            <button onClick={() => onDelete(r.id, r.display_name)} className="border border-racing-red px-2 py-1 text-[10px] font-bold uppercase text-racing-red hover:bg-racing-red/10">{t("sweep_admin_a.actions.delete")}</button>
                          </>
                        )}
                        <AdminUserActions
                          userId={r.id}
                          name={r.display_name}
                          blocked={!!r.blocked_at}
                          protectedAccount={(r.email ?? "").toLowerCase() === "davideguerci76@gmail.com"}
                          invalidateKey="admin-freelancers"
                        />

                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
