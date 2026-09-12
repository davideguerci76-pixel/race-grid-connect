import { confirmDialog } from "@/hooks/use-confirm";
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
  adminReadinessNudgePreview,
  adminReadinessNudgeSend,
  type NudgeOutcome,
  type NudgeRow,
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
  const [readyFilter, setReadyFilter] = useState<"" | "ready" | "not_ready">("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const nudgePreview = useServerFn(adminReadinessNudgePreview);
  const nudgeSend = useServerFn(adminReadinessNudgeSend);
  const [nudging, setNudging] = useState<string | null>(null);
  const [bulk, setBulk] = useState<null | {
    phase: "preview" | "result";
    candidates: string[];
    batchId: string;
    counts: Record<NudgeOutcome, number>;
  }>(null);
  const tr = (k: string, o?: any): string => String(t(`sweep_admin_a.freelancers.readiness.${k}`, o));

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((r: any) => {
      if (role && r.freelancer?.role_group !== role) return false;
      if (readyFilter === "ready" && !r.ready) return false;
      if (readyFilter === "not_ready" && r.ready) return false;
      if (reasonFilter && !(r.ready_reasons ?? []).includes(reasonFilter)) return false;
      if (!s) return true;
      return [r.display_name, r.email, r.freelancer?.pit_code, r.freelancer?.role_group, r.freelancer?.location, ...(r.freelancer?.skills ?? [])]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(s));
    });
  }, [data, q, role, readyFilter, reasonFilter]);

  const roles = useMemo(
    () => Array.from(new Set((data ?? []).map((r: any) => r.freelancer?.role_group).filter(Boolean))).sort(),
    [data],
  );

  // Pool health = whole current ACP environment (LIVE or TEST), independent of the filters below.
  const REASONS = ["missing_role", "missing_phone", "missing_availability", "stale_availability"] as const;
  const pool = useMemo(() => {
    const all = data ?? [];
    const ready = all.filter((r: any) => r.ready).length;
    const byReason: Record<string, number> = {};
    for (const k of REASONS) byReason[k] = all.filter((r: any) => (r.ready_reasons ?? []).includes(k)).length;
    return { registered: all.length, ready, notReady: all.length - ready, byReason };
  }, [data]);

  const reasonLabel = (k: string) => tr(`r_${k}`);
  const gapLabel = (k: string) => tr(`g_${k}`);

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
    if (!await confirmDialog(blocked ? t("sweep_admin_a.confirm_unblock") : t("sweep_admin_a.confirm_block"))) return;
    try {
      await setBlocked({ data: { user_id, blocked: !blocked } });
      toast.success(blocked ? t("sweep_admin_a.unblocked") : t("sweep_admin_a.blocked"));
      qc.invalidateQueries({ queryKey: ["admin-freelancers"] });
    } catch (e: any) {
      toastError(e);
    }
  }

  async function onDelete(user_id: string, name: string) {
    if (!await confirmDialog(t("sweep_admin_a.confirm_delete", { name }))) return;
    try {
      await delUser({ data: { user_id } });
      toast.success(t("sweep_admin_a.user_deleted"));
      qc.invalidateQueries({ queryKey: ["admin-freelancers"] });
    } catch (e: any) {
      toastError(e);
    }
  }

  // ---- UAT-ONBOARD-05: readiness nudge (single + bulk). The server re-validates everything. ----
  const emptyCounts = () => ({ eligible: 0, sent: 0, skipped_ready: 0, skipped_cooldown: 0, skipped_ineligible: 0, skipped_filter: 0, failed: 0 });
  function countOutcomes(res: NudgeRow[]) {
    const c = emptyCounts();
    for (const r of res) c[r.outcome] = (c[r.outcome] ?? 0) + 1;
    return c;
  }
  const ctaLabel = (primary: string | null) =>
    primary === "missing_role" ? t("activation.cta_role") : primary === "missing_phone" ? t("activation.cta_phone") : t("activation.cta_availability");

  async function onNudgeOne(r: any) {
    if (nudging) return;
    const reasons = (r.ready_reasons ?? []).map(reasonLabel).join(", ");
    const primary = (r.ready_reasons ?? [])[0] ?? null;
    const ok = await confirmDialog(tr("nudge_confirm_body", { name: r.display_name, reasons, cta: ctaLabel(primary) }), {
      title: tr("nudge_confirm_title"),
      confirmText: tr("nudge_send"),
    });
    if (!ok) return;
    setNudging(r.id);
    try {
      const res = await nudgeSend({ data: { user_ids: [r.id], mode: "single" } });
      const row = res.rows[0];
      const name = r.display_name;
      if (!row) toast.info(tr("nudge_not_eligible"));
      else if (row.outcome === "sent") toast.success(tr("nudge_sent", { name }));
      else if (row.outcome === "failed") toast.error(tr("nudge_failed", { name }));
      else toast.info(tr(`nudge_${row.outcome}`, { name }));
      if (row?.outcome === "skipped_ready" || row?.outcome === "skipped_ineligible") qc.invalidateQueries({ queryKey: ["admin-freelancers"] });
    } catch (e: any) {
      toastError(e);
    } finally {
      setNudging(null);
    }
  }

  async function onNudgeAllPreview() {
    if (nudging) return;
    // Candidate set = the rows currently shown (NOT READY + filters). Only a narrowing hint: the server
    // re-checks environment, READY, reason and cooldown per user.
    const candidates = rows.filter((r: any) => !r.ready).map((r: any) => r.id);
    if (!candidates.length) return;
    setNudging("__bulk__");
    try {
      const res = await nudgePreview({ data: { user_ids: candidates, reason: reasonFilter || null, role: role || null, mode: "bulk" } });
      setBulk({ phase: "preview", candidates, batchId: crypto.randomUUID(), counts: countOutcomes(res.rows) });
    } catch (e: any) {
      toastError(e);
    } finally {
      setNudging(null);
    }
  }

  async function onNudgeAllConfirm() {
    if (!bulk || bulk.phase !== "preview" || nudging) return;
    setNudging("__bulk__");
    try {
      const res = await nudgeSend({ data: { user_ids: bulk.candidates, reason: reasonFilter || null, role: role || null, mode: "bulk", batch_id: bulk.batchId } });
      setBulk({ ...bulk, phase: "result", counts: countOutcomes(res.rows) });
      qc.invalidateQueries({ queryKey: ["admin-freelancers"] });
    } catch (e: any) {
      toastError(e);
    } finally {
      setNudging(null);
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

      {/* UAT-ONBOARD-04 — Pool health (whole environment; not affected by filters). READY = same DB authority as the Activation Card. */}
      {!isLoading && (
        <div className="mb-4 border border-border" data-testid="pool-health">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-secondary/40 px-3 py-2">
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest">{tr("pool_title")}</div>
            <div className="text-[10px] text-muted-foreground">{tr("env_note")}</div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border">
            {[
              ["registered", pool.registered, "", ""],
              ["ready", pool.ready, "text-emerald-500", "ready"],
              ["not_ready", pool.notReady, "text-racing-yellow", "not_ready"],
            ].map(([k, v, cls, f]) => (
              <button
                key={String(k)}
                type="button"
                onClick={() => { setReadyFilter(f as any); setReasonFilter(""); }}
                className={`p-3 text-left hover:bg-secondary/40 ${readyFilter === f && k !== "registered" ? "bg-secondary/60" : ""}`}
                data-testid={`pool-${k}`}
              >
                <div className={`font-mono text-[10px] font-bold uppercase tracking-widest ${cls}`}>{tr(String(k))}</div>
                <div className="mt-1 font-mono text-2xl font-black tracking-tighter">{String(v)}</div>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-xs">
            <span className="text-muted-foreground">{tr("reasons_title")}:</span>
            {REASONS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => { setReadyFilter("not_ready"); setReasonFilter(reasonFilter === k ? "" : k); }}
                className={`font-mono ${reasonFilter === k ? "text-racing-yellow underline" : "hover:underline"}`}
                data-testid={`pool-reason-${k}`}
              >
                <b>{pool.byReason[k]}</b> {reasonLabel(k)}
              </button>
            ))}
          </div>
        </div>
      )}

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
        <select
          value={readyFilter}
          onChange={(e) => { const v = e.target.value as any; setReadyFilter(v); if (v !== "not_ready") setReasonFilter(""); }}
          className="border border-border bg-background px-3 py-2 text-sm"
          data-testid="filter-ready"
        >
          <option value="">{tr("status_all")}</option>
          <option value="ready">{tr("ready")}</option>
          <option value="not_ready">{tr("not_ready")}</option>
        </select>
        <select
          value={reasonFilter}
          onChange={(e) => { setReasonFilter(e.target.value); if (e.target.value) setReadyFilter("not_ready"); }}
          className="border border-border bg-background px-3 py-2 text-sm"
          data-testid="filter-reason"
        >
          <option value="">{tr("reason_all")}</option>
          {REASONS.map((k) => (
            <option key={k} value={k}>{reasonLabel(k)}</option>
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
              ReadyToMatch: r.ready ? "READY" : "NOT READY",
              NotReadyReasons: (r.ready_reasons ?? []).join(", "),
              ProfileGaps: (r.profile_gaps ?? []).join(", "),
              Travels: r.travels == null ? "" : r.travels ? "yes" : "no",
            })))
          }
          className="border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest hover:bg-secondary"
        >
          {t("sweep_admin_a.export_to_excel")}
        </button>
        {readyFilter === "not_ready" && (
          <button
            onClick={onNudgeAllPreview}
            disabled={nudging === "__bulk__" || rows.length === 0}
            className="border border-racing-yellow px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-racing-yellow hover:bg-racing-yellow/10 disabled:opacity-40"
            data-testid="nudge-all"
          >
            {nudging === "__bulk__" ? "…" : tr("nudge_all")}
          </button>
        )}
        <div className="ml-auto text-xs text-muted-foreground self-center" data-testid="shown-count">
          {tr("shown", { shown: rows.length, total: pool.registered })}
        </div>
      </div>

      {bulk && (
        <div className="mb-4 border border-racing-yellow bg-racing-yellow/10 p-4 text-sm" data-testid="nudge-bulk-panel">
          <div className="font-mono text-xs uppercase tracking-widest text-racing-yellow">{tr("bulk_title")}</div>
          {bulk.phase === "result" ? (
            <>
              <p className="mt-2 font-bold" data-testid="nudge-bulk-result">
                {tr("bulk_result", { sent: bulk.counts.sent, skipped: bulk.counts.skipped_ready + bulk.counts.skipped_cooldown + bulk.counts.skipped_ineligible + bulk.counts.skipped_filter, failed: bulk.counts.failed })}
              </p>
              <ul className="mt-1 grid gap-x-6 text-xs text-muted-foreground sm:grid-cols-2">
                <li>{tr("bulk_skipped_ready")}: {bulk.counts.skipped_ready}</li>
                <li>{tr("bulk_skipped_cooldown")}: {bulk.counts.skipped_cooldown}</li>
                <li>{tr("bulk_skipped_ineligible")}: {bulk.counts.skipped_ineligible}</li>
                <li>{tr("bulk_skipped_filter")}: {bulk.counts.skipped_filter}</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">{tr("bulk_delivery_note")}</p>
              <button onClick={() => setBulk(null)} className="mt-3 border border-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest hover:bg-secondary">{tr("bulk_close")}</button>
            </>
          ) : (
            <>
              <ul className="mt-2 grid gap-x-6 text-xs sm:grid-cols-2" data-testid="nudge-bulk-preview">
                <li>{tr("bulk_target")}: <b>{bulk.candidates.length}</b>{reasonFilter ? ` · ${reasonLabel(reasonFilter)}` : ""}{role ? ` · ${role}` : ""}</li>
                <li>{tr("bulk_eligible")}: <b>{bulk.counts.eligible}</b></li>
                <li>{tr("bulk_skipped_ready")}: {bulk.counts.skipped_ready}</li>
                <li>{tr("bulk_skipped_cooldown")}: {bulk.counts.skipped_cooldown}</li>
                <li>{tr("bulk_skipped_ineligible")}: {bulk.counts.skipped_ineligible}</li>
                <li>{tr("bulk_skipped_filter")}: {bulk.counts.skipped_filter}</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">{tr("bulk_note")}</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={onNudgeAllConfirm}
                  disabled={bulk.counts.eligible === 0 || nudging === "__bulk__"}
                  className="bg-racing-red px-4 py-2 font-mono text-[11px] font-black uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-40"
                  data-testid="nudge-bulk-confirm"
                >
                  {nudging === "__bulk__" ? "…" : tr("bulk_confirm", { count: bulk.counts.eligible })}
                </button>
                <button onClick={() => setBulk(null)} className="border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest hover:bg-secondary">{tr("bulk_cancel")}</button>
              </div>
            </>
          )}
        </div>
      )}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("sweep_admin_a.loading")}</div>
      ) : (
        <div className="overflow-auto border border-border">
          <table className="w-full min-w-[1700px] text-xs">
            <thead className="bg-secondary text-[10px] font-bold uppercase tracking-widest">
              <tr>
                <Th onClick={() => toggle("freelancer.pit_code")} label={`Pit Code${indicator("freelancer.pit_code")}`} />
                <Th onClick={() => toggle("display_name")} label={`${t("sweep_admin_a.columns.name")}${indicator("display_name")}`} />
                <Th onClick={() => toggle("ready")} label={`${tr("col_ready")} / ${tr("col_gaps")}${indicator("ready")}`} />
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
                    <td className="px-2 py-2" data-testid="ready-cell" data-ready={r.ready ? "1" : "0"}>
                      {r.ready ? (
                        <span className="inline-block border border-emerald-500 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-emerald-500">READY</span>
                      ) : (
                        <>
                          <span className="inline-block border border-racing-yellow px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-racing-yellow">NOT READY</span>
                          <div className="mt-1 max-w-[180px] text-[10px] leading-tight text-racing-yellow/90">
                            {(r.ready_reasons ?? []).map(reasonLabel).join(" · ")}
                          </div>
                        </>
                      )}
                      {(r.profile_gaps?.length > 0 || r.travels === false) && (
                        <div className="mt-1 max-w-[180px] text-[10px] leading-tight text-muted-foreground" title={tr("gaps_note")}>
                          {[...(r.profile_gaps ?? []).map(gapLabel), ...(r.travels === false ? [tr("no_travel")] : [])].join(" · ")}
                        </div>
                      )}
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
                        {!r.ready && !r.blocked_at && (r.ready_reasons ?? []).length > 0 && (
                          <button
                            onClick={() => onNudgeOne(r)}
                            disabled={nudging === r.id}
                            className="border border-racing-yellow px-2 py-1 text-[10px] font-bold uppercase text-racing-yellow hover:bg-racing-yellow/10 disabled:opacity-40"
                            data-testid={`nudge-${r.id}`}
                          >
                            {nudging === r.id ? "…" : tr("nudge")}
                          </button>
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
    </div>
  );
}
