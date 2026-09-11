import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Calendar, Coins, Flame, MapPin, Navigation, Users } from "lucide-react";
import { ActionRow, CardBody, CardHeader, CardShell, Fact, FactGrid, StatusChip, cardBtn } from "@/components/cards/primitives";
import { RelevanceScore } from "@/components/cards/match-signals";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { confirmDialog } from "@/hooks/use-confirm";
import { acceptSosCall, getSosCallDetail } from "@/lib/paddock.functions";
import { toastError } from "@/lib/errors";
import { useDateFormat } from "@/lib/date-locale";

export const Route = createFileRoute("/_authenticated/dashboard/sos/$sosId")({
  head: () => ({
    meta: [
      { title: "SOS Call — PITCALL" },
      { name: "description", content: "Review and accept an emergency SOS Call from a motorsport team." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SosCallPage,
});

function SosCallPage() {
  const { t } = useTranslation();
  const { formatDateTime } = useDateFormat();
  const { sosId } = Route.useParams();
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getSosCallDetail);
  const acceptSos = useServerFn(acceptSosCall);

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["sos-detail", sosId],
    queryFn: () => fetchDetail({ data: { sos_id: sosId } }),
    // The SOS is first-confirm-wins: keep the status fresh so a stale Accept is never shown for long.
    refetchInterval: (q) => (q.state.data?.status === "open" ? 10_000 : false),
    retry: false,
  });

  const acceptMut = useMutation({
    mutationFn: () => acceptSos({ data: { sos_id: sosId } }),
    onSuccess: () => {
      toast.success(t("sos.accepted_toast"));
      qc.invalidateQueries();
    },
    onError: (e) => {
      toastError(e, "sos.accept_failed");
      void refetch();
    },
  });

  const req = data?.request as any;
  const status = data?.status;
  const tone = status === "open" ? "danger" : status === "won" ? "success" : "muted";

  const dates = req
    ? Array.isArray(req.season_dates) && req.season_dates.length
      ? `${req.season_dates[0]} → ${req.season_dates[req.season_dates.length - 1]} (${req.season_dates.length})`
      : req.start_date === req.end_date || !req.end_date
        ? req.start_date
        : `${req.start_date} → ${req.end_date}`
    : "—";
  const budget = req && (req.budget_min != null || req.budget_max != null)
    ? `€${req.budget_min ?? "?"}–${req.budget_max ?? "?"} / ${req.budget_unit ?? "day"}`
    : "—";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page max-w-3xl py-12">
        <div className="label-mono text-racing-red">{t("sos.page_label")}</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("sos.page_title")}</h1>

        {isLoading && <div className="mt-6 font-mono text-xs text-muted-foreground">{t("sweep_engage.common.loading")}</div>}

        {error && !data && (
          <div className="mt-6 border border-border p-4">
            <div className="text-sm text-muted-foreground">{t("sos.not_eligible")}</div>
            <Link to="/dashboard" className={`${cardBtn.secondary} mt-4`}>{t("sos.back_dashboard")}</Link>
          </div>
        )}

        {data && (
          <div className="mt-6">
            <CardShell tone={tone as any}>
              <CardHeader
                icon={<Flame className="size-4" />}
                tone={tone as any}
                title={req?.title ?? t("sweep_profile.dashboard.emergency_job")}
                subtitle={[req?.role, req?.sub_role, req?.discipline].filter(Boolean).join(" · ")}
                right={
                  <div className="flex items-center gap-2">
                    <StatusChip tone={status === "open" ? "danger" : status === "won" ? "success" : "muted"}>
                      {status === "open"
                        ? t("sos.status_open")
                        : status === "won"
                          ? t("sos.status_won")
                          : status === "taken"
                            ? t("sos.status_taken")
                            : t("sos.status_resolved")}
                    </StatusChip>
                    <RelevanceScore pct={Math.round(data.skills_score)} size="md" />
                  </div>
                }
              />

              <CardBody>
                {status === "open" && (
                  <>
                    <p className="text-sm text-muted-foreground">{t("sos.intro", { radius: data.radius_km, pct: data.min_pct })}</p>
                    <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-widest text-racing-red">{t("sos.first_wins")}</p>
                  </>
                )}
                {status === "taken" && <p className="text-sm text-muted-foreground">{t("sos.taken_body")}</p>}
                {status === "won" && <p className="text-sm text-success">{t("sos.won_body")}</p>}
                {status === "resolved" && <p className="text-sm text-muted-foreground">{t("sos.resolved_body")}</p>}

                <div className="mt-4"><FactGrid cols={3}>
                  <Fact icon={<Calendar />} label={t("cards.dates")} value={<span className="font-mono">{dates}</span>} />
                  <Fact icon={<MapPin />} label={t("sweep_engage.matches.location_label")} value={req?.circuit || req?.location || "—"} />
                  <Fact icon={<Coins />} label={t("sweep_engage.pitcall_summary.budget")} value={budget} />
                  <Fact icon={<Navigation />} label={t("sos.distance")} value={data.distance_km == null ? "—" : `${Math.round(data.distance_km)} km`} />
                  <Fact icon={<Flame />} label={t("sos.triggered_at")} value={<span className="font-mono">{formatDateTime(data.triggered_at)}</span>} />
                  {data.team && <Fact icon={<Users />} label={t("sos.team_revealed")} value={data.team.team_name ?? t("sweep_profile.dashboard.team_fallback")} />}
                </FactGrid></div>

                {req?.notes && (
                  <div className="mt-4 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                    <div className="font-mono text-[10px] uppercase tracking-widest">{t("sweep_engage.pitcall_summary.notes")}</div>
                    <div className="mt-1 whitespace-pre-wrap">{req.notes}</div>
                  </div>
                )}
              </CardBody>

              <ActionRow>
                {status === "open" && (
                  <button
                    onClick={async () => {
                      if (await confirmDialog(t("sos.accept_confirm"))) acceptMut.mutate();
                    }}
                    disabled={acceptMut.isPending}
                    className={cardBtn.primary}
                  >
                    {t("sos.accept")}
                  </button>
                )}
                {status === "won" && (
                  <Link to="/dashboard/engagements" className={cardBtn.primary}>{t("sos.view_engagement")}</Link>
                )}
                <Link to="/dashboard" className={cardBtn.ghost}>{t("sos.back_dashboard")}</Link>
              </ActionRow>
            </CardShell>
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
