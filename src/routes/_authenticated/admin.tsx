import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { checkAmIAdmin } from "@/lib/admin.functions";
import { adminGetTimeOffset, adminSetTimeOffsetFn, adminTriggerRatingNotifications, adminTriggerCalendarStale, adminEmitContactChecks, adminEmitTeamGhostingReminders, adminReleaseGhostedEngagements } from "@/lib/paddock.functions";
import { SiteHeader } from "@/components/site-header";
import { Clock, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  component: AdminLayout,
});

function AdminLayout() {
  const check = useServerFn(checkAmIAdmin);
  const { data, isLoading } = useQuery({
    queryKey: ["am-i-admin"],
    queryFn: () => check(),
  });
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (isLoading) return <div className="container-page py-10 text-sm text-muted-foreground">Checking access…</div>;
  if (!data?.isAdmin) {
    throw redirect({ to: "/" });
  }

  const tabs = [
    { to: "/admin", label: "Freelancers" },
    { to: "/admin/teams", label: "Teams" },
    { to: "/admin/permissions", label: "Permissions" },
    { to: "/admin/matching", label: "Matching" },
    { to: "/admin/tokens", label: "Tokens" },
    { to: "/admin/reviews", label: "Reviews" },
    { to: "/admin/wiki", label: "Platform Wiki" },
  ];



  return (
    <>
    <SiteHeader />
    <div className="container-page py-8">
      <div className="mb-6 flex items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-racing-red">Admin</div>
          <h1 className="text-2xl font-black italic tracking-tighter">Control Panel</h1>
        </div>
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
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetTimeOffset);
  const setFn = useServerFn(adminSetTimeOffsetFn);
  const triggerFn = useServerFn(adminTriggerRatingNotifications);
  const triggerCalFn = useServerFn(adminTriggerCalendarStale);
  const contactCheckFn = useServerFn(adminEmitContactChecks);
  const teamRemindFn = useServerFn(adminEmitTeamGhostingReminders);
  const releaseGhostedFn = useServerFn(adminReleaseGhostedEngagements);
  const { data } = useQuery({ queryKey: ["admin-time-offset"], queryFn: () => getFn() });
  const [days, setDays] = useState(0);
  useEffect(() => { if (data) setDays(data.offset_days ?? 0); }, [data]);

  const setMut = useMutation({
    mutationFn: (n: number) => setFn({ data: { offset_days: n } }),
    onSuccess: (r: any) => {
      toast.success(`Simulated clock: +${r.offset_days} day(s)`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const triggerMut = useMutation({
    mutationFn: () => triggerFn(),
    onSuccess: (r: any) => toast.success(`Emitted ${r.inserted} rating notifications`),
  });
  const triggerCalMut = useMutation({
    mutationFn: () => triggerCalFn(),
    onSuccess: (r: any) => toast.success(`Emitted ${r.inserted} calendar-stale notifications`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const contactCheckMut = useMutation({
    mutationFn: () => contactCheckFn(),
    onSuccess: (r: any) => toast.success(`Emitted ${r.inserted} contact-check notifications`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const teamRemindMut = useMutation({
    mutationFn: () => teamRemindFn(),
    onSuccess: (r: any) => toast.success(`Emitted ${r.inserted} team ghosting reminders`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const releaseGhostedMut = useMutation({
    mutationFn: () => releaseGhostedFn(),
    onSuccess: (r: any) => toast.success(`Released ${r.released} ghosted engagements`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="mb-6 border border-racing-yellow/50 bg-racing-yellow/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Clock className="size-4 text-racing-yellow" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-racing-yellow">Time Machine (Admin debug)</span>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Advance the simulated clock to test rating windows without waiting real days. Applies globally to all rating time checks.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value) || 0)}
          className="w-24 border border-border bg-background px-2 py-1 font-mono text-sm"
        />
        <span className="font-mono text-[11px] text-muted-foreground">days offset</span>
        <button
          onClick={() => setMut.mutate(days)}
          disabled={setMut.isPending}
          className="bg-racing-yellow px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-carbon hover:brightness-110 disabled:opacity-60"
        >
          Apply
        </button>
        <button
          onClick={() => { setDays(0); setMut.mutate(0); }}
          className="border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
        >
          Reset
        </button>
        <button
          onClick={() => triggerMut.mutate()}
          disabled={triggerMut.isPending}
          className="ml-auto inline-flex items-center gap-1 border border-racing-red px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10"
        >
          <Zap className="size-3" /> Emit rating notifications now
        </button>
        <button
          onClick={() => triggerCalMut.mutate()}
          disabled={triggerCalMut.isPending}
          className="inline-flex items-center gap-1 border border-racing-yellow px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-racing-yellow hover:bg-racing-yellow/10"
        >
          <Zap className="size-3" /> Emit calendar-stale notifications now
        </button>
        <button
          onClick={() => contactCheckMut.mutate()}
          disabled={contactCheckMut.isPending}
          className="inline-flex items-center gap-1 border border-racing-yellow px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-racing-yellow hover:bg-racing-yellow/10"
        >
          <Zap className="size-3" /> Emit contact checks (day 3)
        </button>
        <button
          onClick={() => teamRemindMut.mutate()}
          disabled={teamRemindMut.isPending}
          className="inline-flex items-center gap-1 border border-racing-red px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10"
        >
          <Zap className="size-3" /> Emit team ghosting reminders (day 5 & 8)
        </button>
        <button
          onClick={() => releaseGhostedMut.mutate()}
          disabled={releaseGhostedMut.isPending}
          className="inline-flex items-center gap-1 border border-racing-red bg-racing-red/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-racing-red hover:brightness-110"
        >
          <Zap className="size-3" /> Release ghosted engagements (day 10)
        </button>
      </div>
    </div>
  );
}
