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
import { roleLabel, disciplineLabel } from "@/lib/paddock";

export const Route = createFileRoute("/_authenticated/dashboard/requests/")({
  component: RequestsPage,
});

function RequestsPage() {
  const { t } = useTranslation();
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
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="label-mono">[MY REQUESTS]</div>
            <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("requests.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("requests.subtitle")}</p>
          </div>
          <Link
            to="/dashboard/requests/new"
            className="shrink-0 bg-racing-red px-4 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110"
          >
            + {t("requests.new")}
          </Link>
        </div>

        <div className="mt-8 grid gap-3">
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && requests.length === 0 && (
            <div className="border border-dashed border-border bg-card p-10 text-center">
              <p className="text-sm text-muted-foreground">{t("requests.empty")}</p>
              <Link to="/dashboard/requests/new" className="mt-4 inline-block bg-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-white">
                {t("requests.new")}
              </Link>
            </div>
          )}
          {requests.map((r) => (
            <div key={r.id} className="border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    <span className="font-mono text-[11px] uppercase text-muted-foreground">
                      {roleLabel(r.role)} · {disciplineLabel(r.discipline)}
                    </span>
                  </div>
                  <h2 className="mt-1 text-xl font-bold">{r.title}</h2>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {r.start_date} → {r.end_date}
                    {r.circuit ? ` · ${r.circuit}` : ""}
                    {r.location ? ` · ${r.location}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[11px] uppercase text-muted-foreground">{t("requests.matches")}</div>
                  <div className="text-2xl font-black text-racing-red">
                    {(r.status === "filled" || r.status === "completed") && r.confirmed_engagement_id ? 1 : (r.matches_count ?? 0)}
                  </div>
                  {(r.status === "filled" || r.status === "completed") && r.confirmed_engagement_id && (
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-racing-yellow">Confirmed · Filled</div>
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                <Link
                  to="/dashboard/requests/$id/matches"
                  params={{ id: r.id }}
                  className="border border-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest hover:bg-secondary"
                >
                  {(r.status === "filled" || r.status === "completed") && r.confirmed_engagement_id
                    ? `${t("requests.view_matches")} (1) — Confirmed · Filled`
                    : `${t("requests.view_matches")} (${r.matches_count ?? 0})`}
                </Link>

                {r.status === "active" && (
                  <button
                    onClick={() => statusMut.mutate({ id: r.id, status: "paused" })}
                    className="border border-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest hover:bg-secondary"
                  >
                    {t("requests.pause")}
                  </button>
                )}
                {r.status === "paused" && (
                  <button
                    onClick={() => statusMut.mutate({ id: r.id, status: "active" })}
                    className="border border-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest hover:bg-secondary"
                  >
                    {t("requests.resume")}
                  </button>
                )}
                {(r.status === "active" || r.status === "paused") && (
                  <>
                    <button
                      onClick={() => statusMut.mutate({ id: r.id, status: "completed" })}
                      className="border border-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest hover:bg-secondary"
                    >
                      {t("requests.complete")}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(t("requests.confirm_close"))) statusMut.mutate({ id: r.id, status: "closed" });
                      }}
                      className="border border-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10"
                    >
                      {t("requests.close")}
                    </button>
                  </>
                )}
                {(r.status === "completed" || r.status === "closed" || r.status === "filled") && (
                  <>
                    <Link
                      to="/dashboard/requests/new"
                      search={{ from: r.id }}
                      className="border border-racing-red px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10"
                    >
                      Repost similar
                    </Link>
                    <Link
                      to="/dashboard/requests/new"
                      search={{ from: r.id, mode: "identical" }}
                      className="border border-racing-yellow px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-racing-yellow hover:bg-racing-yellow/10"
                    >
                      Repost identical (discount)
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
  const styles: Record<string, string> = {
    active: "bg-racing-red/15 text-racing-red border-racing-red",
    paused: "bg-yellow-500/10 text-yellow-500 border-yellow-500",
    closed: "bg-muted text-muted-foreground border-border",
    completed: "bg-racing-yellow/10 text-racing-yellow border-racing-yellow",
    filled: "bg-racing-yellow/10 text-racing-yellow border-racing-yellow",
  };
  return (
    <span className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${styles[status] ?? ""}`}>
      {status}
    </span>
  );
}

