import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  adminListPitCalls,
  adminSetPitCallStatus,
  adminDeletePitCall,
  adminAvailabilityCalendar,
} from "@/lib/admin-pitcalls.functions";
import { roleGroupLabel, subRoleLabel, ROLE_GROUPS, subRolesForGroup, SUB_ROLE_LEVELS } from "@/lib/roles";
import { disciplineLabel, DISCIPLINE_OPTIONS, SKILL_OPTIONS, EDUCATION_OPTIONS, LANGUAGE_OPTIONS } from "@/lib/paddock";
import { useDateFormat } from "@/lib/date-locale";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Flame,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Search,
  Trash2,
  Users,
  LogIn,

  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/pitcalls")({
  component: AdminPitCalls,
});

const STATUS_COLORS: Record<string, string> = {
  active: "border-racing-yellow text-racing-yellow",
  paused: "border-muted-foreground text-muted-foreground",
  filled: "border-racing-red text-racing-red",
  closed: "border-border text-muted-foreground",
  completed: "border-border text-muted-foreground",
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-3xl font-black italic tracking-tighter ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function AdminPitCalls() {
  return (
    <div className="space-y-8">
      <PitCallManagement />
      <AvailabilityHeatmap />
    </div>
  );
}

function PitCallManagement() {
  const { t } = useTranslation();
  const { formatDateTime } = useDateFormat();
  const qc = useQueryClient();
  const listFn = useServerFn(adminListPitCalls);
  const statusFn = useServerFn(adminSetPitCallStatus);
  const deleteFn = useServerFn(adminDeletePitCall);

  const { data, isLoading } = useQuery({ queryKey: ["admin-pitcalls"], queryFn: () => listFn() });
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "matches" | "start">("recent");
  const [open, setOpen] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const impersonateFn = useServerFn(adminImpersonateUser);

  async function onImpersonate(teamId: string, teamName: string) {
    if (
      !confirm(
        t("sweep_admin_b.pitcalls.confirm_impersonate", {
          defaultValue:
            "Sign in as {{name}}? This action is recorded in the audit log and opens their dashboard in a new tab.",
          name: teamName,
        }),
      )
    )
      return;
    setImpersonating(teamId);
    try {
      const res: any = await impersonateFn({
        data: { user_id: teamId, redirect_to: `${window.location.origin}/dashboard` },
      });
      window.open(res.url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e?.message ?? t("sweep_admin_b.common.failed"));
    } finally {
      setImpersonating(null);
    }
  }


  const statusMut = useMutation({
    mutationFn: (v: { request_id: string; status: any }) => statusFn({ data: v }),
    onSuccess: () => {
      toast.success(t("sweep_admin_b.pitcalls.updated"));
      qc.invalidateQueries({ queryKey: ["admin-pitcalls"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_admin_b.common.failed")),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { request_id: id } }),
    onSuccess: () => {
      toast.success(t("sweep_admin_b.pitcalls.deleted"));
      qc.invalidateQueries({ queryKey: ["admin-pitcalls"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_admin_b.common.failed")),
  });

  const rows = useMemo(() => {
    let list = [...((data?.rows as any[]) ?? [])];
    if (statusFilter === "hot") list = list.filter((r) => r.hot);
    else if (statusFilter === "reopened") list = list.filter((r) => r.reopened);
    else if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter(
        (r) =>
          String(r.title ?? "").toLowerCase().includes(s) ||
          String(r.team_name ?? "").toLowerCase().includes(s) ||
          String(r.location ?? "").toLowerCase().includes(s),
      );
    }
    if (sort === "matches") list.sort((a, b) => b.matches_count - a.matches_count);
    else if (sort === "start") list.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
    return list;
  }, [data, statusFilter, q, sort]);

  const stats = data?.stats;

  return (
    <section className="space-y-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-widest text-racing-red">{t("sweep_admin_b.pitcalls.management_title")}</div>
        <h2 className="text-2xl font-black italic tracking-tighter">{t("sweep_admin_b.pitcalls.management_subtitle")}</h2>
        <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
          {t("sweep_admin_b.pitcalls.management_description")}
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <Stat label={t("sweep_admin_b.pitcalls.stat_total")} value={stats.total} />
          <Stat label={t("sweep_admin_b.pitcalls.stat_active")} value={stats.active} tone="text-racing-yellow" />
          <Stat label={t("sweep_admin_b.pitcalls.stat_hot")} value={stats.hot} tone="text-racing-red" />
          <Stat label={t("sweep_admin_b.pitcalls.stat_paused")} value={stats.paused} />
          <Stat label={t("sweep_admin_b.pitcalls.stat_filled")} value={stats.filled} tone="text-racing-red" />
          <Stat label={t("sweep_admin_b.pitcalls.stat_reopened")} value={stats.reopened} />
          <Stat label={t("sweep_admin_b.pitcalls.stat_closed")} value={stats.closed} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("sweep_admin_b.pitcalls.search_placeholder")}
            className="rounded-xl border border-border bg-background py-2 pl-7 pr-3 text-xs"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-border bg-background px-2 py-2 text-xs"
        >
          {["all", "active", "hot", "reopened", "paused", "filled", "closed", "completed"].map((s) => (
            <option key={s} value={s}>
              {t(`sweep_admin_b.pitcalls.status_${s}`)}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          className="rounded-xl border border-border bg-background px-2 py-2 text-xs"
        >
          <option value="recent">{t("sweep_admin_b.pitcalls.sort_recent")}</option>
          <option value="matches">{t("sweep_admin_b.pitcalls.sort_matches")}</option>
          <option value="start">{t("sweep_admin_b.pitcalls.sort_start")}</option>
        </select>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
          {t("sweep_admin_b.pitcalls.loading")}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
          {t("sweep_admin_b.pitcalls.no_match")}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r: any) => {
            const expanded = open === r.id;
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card">
                <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <button
                    onClick={() => setOpen(expanded ? null : r.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    {expanded ? <ChevronDown className="mt-1 size-4" /> : <ChevronRight className="mt-1 size-4" />}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${STATUS_COLORS[r.status] ?? "border-border"}`}
                        >
                          {r.status}
                        </span>
                        {r.slots_locked && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-racing-red px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-racing-red">
                            <Lock className="size-3" /> {t("sweep_admin_b.pitcalls.slots_closed")}
                          </span>
                        )}
                        {r.hot && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-racing-red bg-racing-red/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-racing-red">
                            <Flame className="size-3" /> {t("sweep_admin_b.pitcalls.hot")}
                          </span>
                        )}
                        {r.reopened && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-racing-yellow px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-racing-yellow">
                            <RotateCcw className="size-3" /> {t("sweep_admin_b.pitcalls.reopened")}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-base font-bold">{r.title}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {r.sub_role ? subRoleLabel(r.sub_role) : roleGroupLabel(r.role_group)} ·{" "}
                        {disciplineLabel(r.discipline)} · {r.start_date} → {r.end_date}
                      </div>
                      <div className="mt-1.5 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border/70 bg-secondary/40 px-2 py-1 text-[10px]">
                        <span className="font-bold uppercase tracking-widest text-racing-yellow">
                          {t("sweep_admin_b.pitcalls.created_by", { defaultValue: "Created by" })}
                        </span>
                        <span className="font-bold">{r.team_name}</span>
                        {r.team_display_name && r.team_display_name !== r.team_name && (
                          <span className="text-muted-foreground">({r.team_display_name})</span>
                        )}
                        {r.team_email && <span className="font-mono text-muted-foreground">{r.team_email}</span>}
                        <span className="font-mono text-muted-foreground/70">{String(r.team_id).slice(0, 8)}</span>
                        {r.team_blocked && (
                          <span className="font-bold uppercase tracking-widest text-racing-red">
                            {t("sweep_admin_b.pitcalls.team_blocked", { defaultValue: "Blocked" })}
                          </span>
                        )}
                      </div>

                    </div>
                  </button>
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("sweep_admin_b.pitcalls.matches")}</div>
                      <div className="text-2xl font-black text-racing-red">{r.matches_count}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      <a
                        href={`/teams/${r.team_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
                      >
                        <Users className="size-3" /> {t("sweep_admin_b.pitcalls.view_team", { defaultValue: "View team" })}
                      </a>
                      <button
                        onClick={() => onImpersonate(r.team_id, r.team_name)}
                        disabled={impersonating === r.team_id}
                        className="inline-flex items-center gap-1 rounded-lg border border-racing-red px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10 disabled:opacity-50"
                      >
                        <LogIn className="size-3" />{" "}
                        {impersonating === r.team_id
                          ? "…"
                          : t("sweep_admin_b.pitcalls.login_as_user", { defaultValue: "Login as user" })}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">

                      <button
                        onClick={() => statusMut.mutate({ request_id: r.id, status: "active" })}
                        className="inline-flex items-center gap-1 rounded-lg border border-racing-yellow px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-racing-yellow hover:bg-racing-yellow/10"
                      >
                        <Play className="size-3" /> {t("sweep_admin_b.pitcalls.reopen")}
                      </button>
                      <button
                        onClick={() => statusMut.mutate({ request_id: r.id, status: "paused" })}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
                      >
                        <Pause className="size-3" /> {t("sweep_admin_b.pitcalls.suspend")}
                      </button>
                      <button
                        onClick={() => statusMut.mutate({ request_id: r.id, status: "closed" })}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
                      >
                        <XCircle className="size-3" /> {t("sweep_admin_b.pitcalls.close")}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(t("sweep_admin_b.pitcalls.confirm_delete"))) {
                            deleteMut.mutate(r.id);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-racing-red px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10"
                      >
                        <Trash2 className="size-3" /> {t("sweep_admin_b.pitcalls.delete")}
                      </button>
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div className="grid gap-4 border-t border-border p-4 md:grid-cols-2">
                    <div>
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-racing-yellow">
                        {t("sweep_admin_b.pitcalls.first_responder_title")}
                      </div>
                      {r.first_responder ? (
                        <div className="rounded-xl border border-racing-yellow/50 bg-racing-yellow/5 p-3 text-xs">
                          <div className="font-bold">{r.first_responder.name}</div>
                          <div className="text-muted-foreground">
                            {t("sweep_admin_b.pitcalls.confirmed_at")}{" "}
                            {r.first_responder.confirmed_at
                              ? formatDateTime(r.first_responder.confirmed_at)
                              : "—"}
                          </div>
                          <div className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-racing-red">
                            <Lock className="size-3" /> {t("sweep_admin_b.pitcalls.all_locked_out")}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
                          {t("sweep_admin_b.pitcalls.no_confirmation_yet")}
                        </div>
                      )}

                      <div className="mb-2 mt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {t("sweep_admin_b.pitcalls.contacted_locked_out", { count: r.blocked_candidates.length })}
                      </div>
                      {r.blocked_candidates.length === 0 ? (
                        <div className="text-xs text-muted-foreground">{t("sweep_admin_b.pitcalls.none")}</div>
                      ) : (
                        <ul className="space-y-1 text-xs">
                          {r.blocked_candidates.map((c: any) => (
                            <li key={c.freelancer_id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2 py-1">
                              <span>{c.name}</span>
                              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                {c.outcome === "slot_closed" ? t("sweep_admin_b.pitcalls.slot_closed_first") : t("sweep_admin_b.pitcalls.locked_pending")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-racing-red">
                        {t("sweep_admin_b.pitcalls.withdrawals_title")}
                      </div>
                      {r.withdrawals.length === 0 ? (
                        <div className="text-xs text-muted-foreground">{t("sweep_admin_b.pitcalls.no_withdrawal")}</div>
                      ) : (
                        <ul className="space-y-2 text-xs">
                          {r.withdrawals.map((w: any) => (
                            <li key={w.engagement_id} className="rounded-xl border border-racing-red/40 bg-racing-red/5 p-2">
                              <div className="flex items-center gap-1 font-bold">
                                <AlertTriangle className="size-3 text-racing-red" /> {w.name} ·{" "}
                                {w.by_team ? t("sweep_admin_b.pitcalls.team_withdrew") : t("sweep_admin_b.pitcalls.freelancer_withdrew")}
                              </div>
                              <div className="text-muted-foreground">
                                {w.kind} · {formatDateTime(w.at)}
                              </div>
                              {w.reason && <div className="mt-1 italic text-muted-foreground">“{w.reason}”</div>}
                              <div className="mt-1 text-[10px] uppercase tracking-widest text-racing-yellow">
                                {w.kind === "team_late"
                                  ? t("sweep_admin_b.pitcalls.archived_no_reopening")
                                  : t("sweep_admin_b.pitcalls.reopened_notified")}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="mb-2 mt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {t("sweep_admin_b.pitcalls.match_register", { count: Math.min(20, r.candidates.length) })}
                      </div>
                      {r.candidates.length === 0 ? (
                        <div className="text-xs text-muted-foreground">{t("sweep_admin_b.pitcalls.no_candidate")}</div>
                      ) : (
                        <ul className="space-y-1 text-xs">
                          {r.candidates.map((c: any) => (
                            <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2 py-1">
                              <span className="truncate">{c.freelancer_name}</span>
                              <span className="font-mono text-[10px] text-racing-red">
                                {Math.round(Number(c.final_score ?? 0))}%{c.is_partial ? ` · -${c.missing_days}d` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function monthDays(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  const days: string[] = [];
  for (let d = 1; d <= last.getUTCDate(); d++) {
    days.push(new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10));
  }
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  return { days, lead };
}

function AvailabilityHeatmap() {
  const { t } = useTranslation();
  const { formatMonthYear } = useDateFormat();
  const calFn = useServerFn(adminAvailabilityCalendar);
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [filters, setFilters] = useState<any>({
    role_group: "",
    sub_role: "",
    level: "",
    discipline: "",
    skills: [] as string[],
    education: "",
    language: "",
    travels: "",
    max_day_rate: "",
    country: "",
    search: "",
  });

  const { days, lead } = monthDays(cursor.y, cursor.m);
  const from = days[0];
  const to = days[days.length - 1];

  const payload = {
    from,
    to,
    role_group: filters.role_group || null,
    sub_role: filters.sub_role || null,
    level: filters.level || null,
    discipline: filters.discipline || null,
    skills: filters.skills,
    education: filters.education || null,
    language: filters.language || null,
    travels: filters.travels === "" ? null : filters.travels === "yes",
    max_day_rate: filters.max_day_rate ? Number(filters.max_day_rate) : null,
    country: filters.country || null,
    search: filters.search || null,
  };

  const { data, isFetching } = useQuery({
    queryKey: ["admin-availability", payload],
    queryFn: () => calFn({ data: payload }),
  });

  const countMap = new Map(((data?.days as any[]) ?? []).map((d) => [d.day, d]));
  const max = Math.max(1, ...((data?.days as any[]) ?? []).map((d) => d.count));

  const set = (k: string, v: any) => setFilters((f: any) => ({ ...f, [k]: v }));
  const subRoles = subRolesForGroup(filters.role_group || null);

  return (
    <section className="space-y-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-widest text-racing-red">{t("sweep_admin_b.heatmap.title")}</div>
        <h2 className="text-2xl font-black italic tracking-tighter">{t("sweep_admin_b.heatmap.subtitle")}</h2>
        <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
          {t("sweep_admin_b.heatmap.description")}
        </p>
      </div>

      <div className="grid gap-2 rounded-2xl border border-border bg-card p-4 md:grid-cols-3 lg:grid-cols-4">
        <select
          value={filters.role_group}
          onChange={(e) => setFilters((f: any) => ({ ...f, role_group: e.target.value, sub_role: "" }))}
          className="rounded-xl border border-border bg-background px-2 py-2 text-xs"
        >
          <option value="">{t("sweep_admin_b.heatmap.any_macro_role")}</option>
          {ROLE_GROUPS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
        <select
          value={filters.sub_role}
          onChange={(e) => set("sub_role", e.target.value)}
          className="rounded-xl border border-border bg-background px-2 py-2 text-xs"
        >
          <option value="">{t("sweep_admin_b.heatmap.any_sub_role")}</option>
          {subRoles.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={filters.level}
          onChange={(e) => set("level", e.target.value)}
          className="rounded-xl border border-border bg-background px-2 py-2 text-xs"
        >
          <option value="">{t("sweep_admin_b.heatmap.any_seniority")}</option>
          {SUB_ROLE_LEVELS.map((l) => (
            <option key={l} value={l}>
              {t("sweep_admin_b.heatmap.min_level", { level: l })}
            </option>
          ))}
        </select>
        <select
          value={filters.discipline}
          onChange={(e) => set("discipline", e.target.value)}
          className="rounded-xl border border-border bg-background px-2 py-2 text-xs"
        >
          <option value="">{t("sweep_admin_b.heatmap.any_discipline")}</option>
          {DISCIPLINE_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          value={filters.education}
          onChange={(e) => set("education", e.target.value)}
          className="rounded-xl border border-border bg-background px-2 py-2 text-xs"
        >
          <option value="">{t("sweep_admin_b.heatmap.any_education")}</option>
          {EDUCATION_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          value={filters.language}
          onChange={(e) => set("language", e.target.value)}
          className="rounded-xl border border-border bg-background px-2 py-2 text-xs"
        >
          <option value="">{t("sweep_admin_b.heatmap.any_language")}</option>
          {LANGUAGE_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          value={filters.travels}
          onChange={(e) => set("travels", e.target.value)}
          className="rounded-xl border border-border bg-background px-2 py-2 text-xs"
        >
          <option value="">{t("sweep_admin_b.heatmap.travel_any")}</option>
          <option value="yes">{t("sweep_admin_b.heatmap.travels_yes")}</option>
          <option value="no">{t("sweep_admin_b.heatmap.travels_no")}</option>
        </select>
        <input
          value={filters.max_day_rate}
          onChange={(e) => set("max_day_rate", e.target.value)}
          placeholder={t("sweep_admin_b.heatmap.max_day_rate")}
          type="number"
          className="rounded-xl border border-border bg-background px-2 py-2 text-xs"
        />
        <input
          value={filters.country}
          onChange={(e) => set("country", e.target.value)}
          placeholder={t("sweep_admin_b.heatmap.country")}
          className="rounded-xl border border-border bg-background px-2 py-2 text-xs"
        />
        <input
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          placeholder={t("sweep_admin_b.heatmap.name_contains")}
          className="rounded-xl border border-border bg-background px-2 py-2 text-xs"
        />
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v && !filters.skills.includes(v)) set("skills", [...filters.skills, v]);
          }}
          className="rounded-xl border border-border bg-background px-2 py-2 text-xs"
        >
          <option value="">{t("sweep_admin_b.heatmap.add_skill_filter")}</option>
          {SKILL_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            setFilters({
              role_group: "",
              sub_role: "",
              level: "",
              discipline: "",
              skills: [],
              education: "",
              language: "",
              travels: "",
              max_day_rate: "",
              country: "",
              search: "",
            })
          }
          className="rounded-xl border border-border px-2 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
        >
          {t("sweep_admin_b.heatmap.reset_filters")}
        </button>
        {filters.skills.length > 0 && (
          <div className="col-span-full flex flex-wrap gap-1">
            {filters.skills.map((s: string) => (
              <button
                key={s}
                onClick={() => set("skills", filters.skills.filter((x: string) => x !== s))}
                className="rounded-full border border-racing-red px-2 py-0.5 text-[10px] uppercase text-racing-red"
              >
                {SKILL_OPTIONS.find((o) => o.value === s)?.label ?? s} ✕
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            onClick={() => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))}
            className="rounded-lg border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
          >
            {t("sweep_admin_b.heatmap.prev")}
          </button>
          <div className="inline-flex items-center gap-2 text-sm font-black uppercase italic tracking-tighter">
            <CalendarDays className="size-4 text-racing-red" />
            {formatMonthYear(new Date(Date.UTC(cursor.y, cursor.m, 1)))}
          </div>
          <button
            onClick={() => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))}
            className="rounded-lg border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
          >
            {t("sweep_admin_b.heatmap.next")}
          </button>
        </div>

        <div className="mb-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Users className="size-3" /> {t("sweep_admin_b.heatmap.freelancers_match", { count: data?.total_freelancers ?? 0 })}
          {isFetching ? ` · ${t("sweep_admin_b.heatmap.refreshing")}` : ""}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {(t("sweep_admin_b.heatmap.weekdays", { returnObjects: true }) as string[]).map((d) => (
            <div key={d} className="py-1 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {d}
            </div>
          ))}
          {Array.from({ length: lead }).map((_, i) => (
            <div key={`lead-${i}`} />
          ))}
          {days.map((day) => {
            const info: any = countMap.get(day);
            const count = info?.count ?? 0;
            const intensity = count === 0 ? 0 : Math.max(0.15, Math.min(1, count / max));
            return (
              <div
                key={day}
                title={count ? t("sweep_admin_b.heatmap.available_tooltip", { count, names: (info?.names ?? []).join(", ") }) : t("sweep_admin_b.heatmap.no_availability")}
                className="relative aspect-square rounded-lg border border-border p-1 text-[10px]"
                style={count ? { backgroundColor: `color-mix(in srgb, var(--racing-yellow, #F2C200) ${intensity * 45}%, transparent)` } : undefined}
              >
                <span className="text-muted-foreground">{Number(day.slice(-2))}</span>
                {count > 0 && (
                  <span className="absolute bottom-1 right-1 rounded-full bg-racing-red px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                    {count}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
