import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DISCIPLINES, DURATIONS, type Discipline, type DurationType } from "@/lib/paddock";
import { ROLE_GROUPS, roleGroupLabel, subRoleLabel } from "@/lib/roles";

export const Route = createFileRoute("/jobs")({
  component: JobsPage,
});

function JobsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<string>("all");
  const [disc, setDisc] = useState<Discipline | "all">("all");
  const [dur, setDur] = useState<DurationType | "all">("all");
  const [confirmRequestId, setConfirmRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["account-type", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("user_type").eq("id", user!.id).maybeSingle()).data,
  });
  const isTeam = profile?.user_type === "team";
  const isFreelancer = profile?.user_type === "freelancer";

  const { data: reveals = [] } = useQuery({
    queryKey: ["request-reveals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("request_team_reveals").select("request_id").eq("user_id", user!.id);
      return (data ?? []).map((r) => r.request_id);
    },
  });

  const revealedSet = new Set(reveals);

  const { data: requests = [] } = useQuery({
    queryKey: ["public-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("*")
        .eq("is_active", true)
        .order("start_date", { ascending: true });
      if (error) throw error;
      const teamIds = Array.from(new Set((data ?? []).map((r) => r.team_id)));
      const teamsMap = new Map<string, { team_name: string; initials: string | null }>();
      if (teamIds.length > 0) {
        const { data: teams } = await supabase.from("team_profiles").select("user_id, team_name, initials").in("user_id", teamIds);
        (teams ?? []).forEach((t) => teamsMap.set(t.user_id, { team_name: t.team_name, initials: t.initials }));
      }
      return (data ?? []).map((r) => ({ ...r, team: teamsMap.get(r.team_id) ?? null }));
    },
  });

  const revealMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase.rpc("reveal_request", { _request_id: requestId });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_data, requestId) => {
      setConfirmRequestId(null);
      setError(null);
      qc.invalidateQueries({ queryKey: ["request-reveals"] });
      qc.invalidateQueries({ queryKey: ["dashboard-profile"] });
      const req = requests.find((r) => r.id === requestId);
      if (req) navigate({ to: "/teams/$id", params: { id: req.team_id }, search: { req: requestId } });
    },
    onError: (e: Error) => setError(e.message),
  });

  const filtered = requests.filter((r) => {
    if (role !== "all" && (r as any).role_group !== role) return false;
    if (disc !== "all" && r.discipline !== disc) return false;
    if (dur !== "all" && r.duration !== dur) return false;
    if (q && !`${r.title} ${r.circuit ?? ""} ${r.location ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  function handleViewRequest(r: { id: string; team_id: string }) {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (isTeam || revealedSet.has(r.id)) {
      navigate({ to: "/teams/$id", params: { id: r.team_id }, search: { req: r.id } });
      return;
    }
    setError(null);
    setConfirmRequestId(r.id);
  }



  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="label-mono">[PIT CALLS]</div>
            <h1 className="text-5xl font-black uppercase italic tracking-tighter">{t("jobs.title")}</h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-racing-red">{t("requests.helper")}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t("jobs.sub", { filtered: filtered.length, total: requests.length })}</p>
          </div>
          {isTeam ? (
            <Link to="/dashboard/requests/new" title={t("requests.helper")} className="bg-racing-red px-4 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110">
              {t("jobs.post_request")}
            </Link>

          ) : null}
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("jobs.filters.search_placeholder")}
            className="border border-border bg-card px-3 py-2 focus:border-racing-red focus:outline-none"
          />
          <FilterSelect value={role} onChange={(v) => setRole(v)} label={t("jobs.filters.role")} options={ROLE_GROUPS.map((g) => g.value)} translate={(v) => roleGroupLabel(v)} />
          <FilterSelect value={disc} onChange={(v) => setDisc(v as Discipline | "all")} label={t("jobs.filters.discipline")} options={DISCIPLINES} translate={(v) => t(`discipline.${v}`)} />
          <FilterSelect value={dur} onChange={(v) => setDur(v as DurationType | "all")} label={t("jobs.filters.duration")} options={DURATIONS} translate={(v) => t(`duration.${v}`)} />
        </div>

        {filtered.length === 0 ? (
          <div className="border border-border bg-card p-12 text-center text-sm text-muted-foreground">{t("jobs.empty")}</div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((r) => {
              const canSeeTeam = isTeam || revealedSet.has(r.id);
              return (
              <div key={r.id} className="grid gap-4 border border-border bg-card p-5 md:grid-cols-[1fr,auto] md:items-center">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="border border-racing-red/40 bg-racing-red/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-racing-red">{t(`discipline.${r.discipline}`)}</span>
                    <span className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{(r as any).sub_role ? subRoleLabel((r as any).sub_role) : roleGroupLabel((r as any).role_group)}</span>
                    <span className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t(`duration.${r.duration}`)}</span>
                  </div>
                  <div className="text-lg font-bold">{r.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {canSeeTeam ? (r.team?.team_name ?? t("sweep_public.jobs.team_default")) : t("sweep_public.jobs.hidden_team")}{r.circuit ? ` · ${r.circuit}` : ""}{r.location ? ` · ${r.location}` : ""}
                  </div>
                  <div className="mt-2 font-mono text-xs text-muted-foreground">
                    {r.start_date} → {r.end_date}
                  </div>
                </div>
                <div className="text-right">
                  {r.budget_min || r.budget_max ? (
                    <div className="font-mono text-sm font-bold text-racing-yellow">
                      {r.currency} {r.budget_min ?? ""}{r.budget_max ? `–${r.budget_max}` : ""} <span className="text-[10px] text-muted-foreground">/{r.budget_unit}</span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleViewRequest(r)}
                    className="mt-2 inline-block bg-foreground px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-background hover:bg-racing-red hover:text-white"
                  >
                    {canSeeTeam ? t("sweep_public.jobs.view_team") : t("sweep_public.jobs.reveal_team_button")}
                  </button>
                </div>
              </div>
            );})}
          </div>
        )}
      </div>

      {confirmRequestId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !revealMutation.isPending && setConfirmRequestId(null)}>
          <div className="w-full max-w-md border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="label-mono">{t("sweep_public.jobs.modal.title")}</div>
            <h2 className="mt-1 text-2xl font-black uppercase italic tracking-tighter">{t("sweep_public.jobs.modal.heading")}</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {t("sweep_public.jobs.modal.desc")}
            </p>
            {isFreelancer === false && !isTeam ? null : null}
            {error && <div className="mt-3 border border-racing-red/40 bg-racing-red/10 p-3 text-xs text-racing-red">{error}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmRequestId(null)} disabled={revealMutation.isPending} className="border border-border px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-muted">
                {t("sweep_public.jobs.modal.cancel")}
              </button>
              <button
                type="button"
                onClick={() => revealMutation.mutate(confirmRequestId)}
                disabled={revealMutation.isPending}
                className="bg-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
              >
                {revealMutation.isPending ? t("sweep_public.jobs.modal.revealing") : t("sweep_public.jobs.modal.reveal_button")}
              </button>
            </div>
          </div>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}

function FilterSelect<T extends string>({ value, onChange, label, options, translate }: { value: T | "all"; onChange: (v: string) => void; label: string; options: readonly T[]; translate: (v: T) => string }) {
  return (
    <div>
      <label className="label-mono">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full border border-border bg-card px-3 py-2 focus:border-racing-red focus:outline-none">
        <option value="all">—</option>
        {options.map((o) => <option key={o} value={o}>{translate(o)}</option>)}
      </select>
    </div>
  );
}
