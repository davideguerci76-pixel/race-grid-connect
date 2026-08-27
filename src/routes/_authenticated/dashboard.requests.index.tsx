import { confirmDialog } from "@/hooks/use-confirm";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getMyRequests, setRequestStatus } from "@/lib/paddock.functions";
import { disciplineLabel } from "@/lib/paddock";
import { PoolBadge } from "@/components/pool-badge";
import { roleGroupLabel, subRoleLabel } from "@/lib/roles";
import { Plus, Calendar, MapPin, Wrench, Eye, Pause, Play, CheckCircle2, XCircle, Copy, RotateCcw } from "lucide-react";
import { usePlatformFlags } from "@/hooks/use-platform-flags";
import { BackButton } from "@/components/back-button";
import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/dashboard/requests/")({
  component: RequestsPage,
});

function RequestsPage() {
  const { t } = useTranslation();
  const flags = usePlatformFlags();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["account-type", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("user_type").eq("id", user!.id).maybeSingle()).data,
  });

  useEffect(() => {
    if (profile && profile.user_type !== "team") {
      navigate({ to: "/dashboard/calendar" });
    }
  }, [profile, navigate]);

  const list = useServerFn(getMyRequests);
  const setStatus = useServerFn(setRequestStatus);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["my-requests", user?.id],
    enabled: !!user && profile?.user_type === "team",
    queryFn: () => list(),
  });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: "active" | "paused" | "closed" | "completed" }) =>
      setStatus({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-requests"] });
      toast.success(t("requests.status_updated"));
    },
    onError: (e) => toastError(e, "sweep_engage.common.failed"),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="label-mono">[MY PIT CALLS]</div>
            <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("requests.title")}</h1>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-racing-red">{t("requests.helper")}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t("requests.subtitle")}</p>
          </div>
          {flags.pitcallCreationDisabled ? (
            <div className="shrink-0 border border-border bg-secondary px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              {t("sweep_admin_a.pitcall_creation_disabled")}
            </div>
          ) : (
          <Link
            to="/dashboard/requests/new"
            title={t("requests.helper")}
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-racing-red px-4 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110"
          >
            <Plus className="size-4" /> {t("requests.new")}

          </Link>
          )}
        </div>

        <div className="mt-8 grid gap-3">
          {isLoading && <div className="text-sm text-muted-foreground">{t("sweep_engage.common.loading")}</div>}
          {!isLoading && requests.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-border bg-card p-10 text-center">
              <p className="text-sm text-muted-foreground">{t("requests.empty")}</p>
              {!flags.pitcallCreationDisabled && (
              <Link to="/dashboard/requests/new" className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-white">
                {t("requests.new")}
              </Link>
              )}
            </div>
          )}
          {requests.map((r) => (
            <div key={r.id} className="card-surface p-5 transition-colors hover:border-racing-red/60">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    {(r as any).search_mode === "pool" && <PoolBadge />}
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Wrench className="size-3.5" />
                      {(r as any).sub_role ? subRoleLabel((r as any).sub_role) : roleGroupLabel((r as any).role_group)} · {disciplineLabel(r.discipline)}
                    </span>
                  </div>
                  <h2 className="mt-1 text-xl font-bold">{r.title}</h2>
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><Calendar className="size-3.5" />{r.start_date} → {r.end_date}</span>
                    {(r.circuit || r.location) && (
                      <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />{[r.circuit, r.location].filter(Boolean).join(" · ")}</span>
                    )}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-background px-4 py-2 text-right">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("requests.matches")}</div>
                  <div className="text-2xl font-black text-racing-red">
                    {(r.status === "filled" || r.status === "completed") && r.confirmed_engagement_id ? 1 : (r.matches_count ?? 0)}
                  </div>
                  {(r.status === "filled" || r.status === "completed") && r.confirmed_engagement_id && (
                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-racing-yellow">{t("sweep_engage.requests.confirmed_filled")}</div>
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                <Link
                  to="/dashboard/requests/$id/matches"
                  params={{ id: r.id }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest hover:bg-secondary"
                >
                  <Eye className="size-4" />
                  {(r.status === "filled" || r.status === "completed") && r.confirmed_engagement_id
                    ? t("sweep_engage.requests.view_matches_confirmed", { label: t("requests.view_matches") })
                    : `${t("requests.view_matches")} (${r.matches_count ?? 0})`}
                </Link>

                {r.status === "paused" && (
                  <button
                    onClick={() => statusMut.mutate({ id: r.id, status: "active" })}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest hover:bg-secondary"
                  >
                    <Play className="size-4" /> {t("requests.resume")}
                  </button>
                )}
                {(r.status === "active" || r.status === "paused") && (
                  <button
                    onClick={async () => {
                      if (await confirmDialog(t("requests.confirm_close"))) statusMut.mutate({ id: r.id, status: "closed" });
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl border border-racing-red/60 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10"
                  >
                    <XCircle className="size-4" /> {t("requests.close")}
                  </button>
                )}
                {!flags.pitcallCreationDisabled && (
                  <>
                    <Link
                      to="/dashboard/requests/new"
                      search={{ from: r.id }}
                      className="inline-flex items-center gap-2 rounded-2xl border border-racing-red px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10"
                    >
                      <RotateCcw className="size-4" /> {t("sweep_engage.requests.repost_similar")}
                    </Link>
                    <Link
                      to="/dashboard/requests/new"
                      search={{ from: r.id, mode: "identical" }}
                      className="inline-flex items-center gap-2 rounded-2xl border border-racing-yellow px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-racing-yellow hover:bg-racing-yellow/10"
                    >
                      <Copy className="size-4" /> {t("sweep_engage.requests.repost_identical")}
                    </Link>
                  </>
                )}

              </div>
            </div>
          ))}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const styles: Record<string, string> = {
    active: "bg-racing-red/15 text-racing-red border-racing-red",
    paused: "bg-yellow-500/10 text-yellow-500 border-yellow-500",
    closed: "bg-muted text-muted-foreground border-border",
    completed: "bg-racing-yellow/10 text-racing-yellow border-racing-yellow",
    filled: "bg-racing-yellow/10 text-racing-yellow border-racing-yellow",
  };
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${styles[status] ?? ""}`}>
      {t(`sweep_engage.requests.status.${status}`)}
    </span>
  );
}

