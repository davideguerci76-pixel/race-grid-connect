import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { checkAmIAdmin } from "@/lib/admin.functions";
import { adminGetTimeOffset, adminSetTimeOffsetFn, adminTriggerRatingNotifications, adminTriggerCalendarStale } from "@/lib/paddock.functions";
import { SiteHeader } from "@/components/site-header";
import { Clock, Zap } from "lucide-react";
import { BackButton } from "@/components/back-button";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  component: AdminLayout,
});

function AdminLayout() {
  const { t } = useTranslation();
  const check = useServerFn(checkAmIAdmin);
  const { data, isLoading } = useQuery({
    queryKey: ["am-i-admin"],
    queryFn: () => check(),
  });
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (isLoading) return <div className="container-page py-10 text-sm text-muted-foreground">{t("sweep_admin_a.checking_access")}</div>;
  if (!data?.isAdmin) {
    throw redirect({ to: "/" });
  }

  const tabs = [
    { to: "/admin", label: t("sweep_admin_a.tabs.freelancers") },
    { to: "/admin/teams", label: t("sweep_admin_a.tabs.teams") },
    { to: "/admin/pitcalls", label: t("sweep_admin_a.tabs.pitcalls") },
    { to: "/admin/permissions", label: t("sweep_admin_a.tabs.permissions") },
    { to: "/admin/matching", label: t("sweep_admin_a.tabs.matching") },
    { to: "/admin/tokens", label: t("sweep_admin_a.tabs.tokens") },
    { to: "/admin/reviews", label: t("sweep_admin_a.tabs.reviews") },
    { to: "/admin/calendars", label: t("sweep_admin_a.tabs.calendars") },
    { to: "/admin/wiki", label: t("sweep_admin_a.tabs.wiki") },
    { to: "/admin/launch", label: t("sweep_admin_a.tabs.launch") },
    { to: "/admin/testing", label: t("sweep_admin_a.tabs.testing") },

  ];



  return (
    <>
    <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
    <div className="container-page py-8">
      <AdminEnvBanner />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-racing-red">{t("sweep_admin_a.admin_label")}</div>
          <h1 className="text-2xl font-black italic tracking-tighter">{t("sweep_admin_a.control_panel")}</h1>
        </div>
        <AdminEnvSwitch />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = path === t.to || (t.to === "/admin" && path === "/admin/");
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`border px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                active ? "border-racing-red bg-racing-red/10 text-racing-red" : "border-border hover:bg-secondary"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <TimeMachine />
      <Outlet />
    </div>
    </>
  );
}

function TimeMachine() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetTimeOffset);
  const setFn = useServerFn(adminSetTimeOffsetFn);
  const triggerFn = useServerFn(adminTriggerRatingNotifications);
  const triggerCalFn = useServerFn(adminTriggerCalendarStale);
  const { data } = useQuery({ queryKey: ["admin-time-offset"], queryFn: () => getFn() });
  const [days, setDays] = useState(0);
  useEffect(() => { if (data) setDays(data.offset_days ?? 0); }, [data]);

  const setMut = useMutation({
    mutationFn: (n: number) => setFn({ data: { offset_days: n } }),
    onSuccess: (r: any) => {
      toast.success(t("sweep_admin_a.time_machine.simulated_clock", { count: r.offset_days }));
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_admin_a.failed")),
  });
  const triggerMut = useMutation({
    mutationFn: () => triggerFn(),
    onSuccess: (r: any) => toast.success(t("sweep_admin_a.time_machine.emitted_rating", { count: r.inserted })),
  });
  const triggerCalMut = useMutation({
    mutationFn: () => triggerCalFn(),
    onSuccess: (r: any) => toast.success(t("sweep_admin_a.time_machine.emitted_calendar", { count: r.inserted })),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_admin_a.failed")),
  });

  return (
    <div className="mb-6 border border-racing-yellow/50 bg-racing-yellow/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Clock className="size-4 text-racing-yellow" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-racing-yellow">{t("sweep_admin_a.time_machine.title")}</span>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        {t("sweep_admin_a.time_machine.description")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value) || 0)}
          className="w-24 border border-border bg-background px-2 py-1 font-mono text-sm"
        />
        <span className="font-mono text-[11px] text-muted-foreground">{t("sweep_admin_a.time_machine.days_offset")}</span>
        <button
          onClick={() => setMut.mutate(days)}
          disabled={setMut.isPending}
          className="bg-racing-yellow px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-carbon hover:brightness-110 disabled:opacity-60"
        >
          {t("sweep_admin_a.time_machine.apply")}
        </button>
        <button
          onClick={() => { setDays(0); setMut.mutate(0); }}
          className="border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
        >
          {t("sweep_admin_a.time_machine.reset")}
        </button>
        <button
          onClick={() => triggerMut.mutate()}
          disabled={triggerMut.isPending}
          className="ml-auto inline-flex items-center gap-1 border border-racing-red px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10"
        >
          <Zap className="size-3" /> {t("sweep_admin_a.time_machine.emit_rating_now")}
        </button>
        <button
          onClick={() => triggerCalMut.mutate()}
          disabled={triggerCalMut.isPending}
          className="inline-flex items-center gap-1 border border-racing-yellow px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-racing-yellow hover:bg-racing-yellow/10"
        >
          <Zap className="size-3" /> {t("sweep_admin_a.time_machine.emit_calendar_now")}
        </button>
      </div>
    </div>
  );
}
