import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { setAvailability, getMyAvailability, getMyBlockedDates, confirmMyCalendar, getMyCalendarFreshness } from "@/lib/paddock.functions";
import { BackButton } from "@/components/back-button";
import { CalendarSourcePicker } from "@/components/calendar-source-picker";
import { dateOf, isoOf } from "@/lib/ics";
import { useDateFormat } from "@/lib/date-locale";

export const Route = createFileRoute("/_authenticated/dashboard/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
  const { t } = useTranslation();
  const { formatDate } = useDateFormat();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["account-type", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("user_type").eq("id", user!.id).maybeSingle()).data,
  });

  useEffect(() => {
    if (profile && profile.user_type === "team") navigate({ to: "/dashboard/requests" });
  }, [profile, navigate]);

  const getAvail = useServerFn(getMyAvailability);
  const getBlocked = useServerFn(getMyBlockedDates);
  const setAvail = useServerFn(setAvailability);
  const getFresh = useServerFn(getMyCalendarFreshness);
  const confirmCal = useServerFn(confirmMyCalendar);

  const { data: myDays = [] } = useQuery({
    queryKey: ["my-availability", user?.id],
    enabled: !!user && profile?.user_type === "freelancer",
    queryFn: () => getAvail(),
  });

  const { data: blockedDays = [] } = useQuery({
    queryKey: ["my-blocked-dates", user?.id],
    enabled: !!user && profile?.user_type === "freelancer",
    queryFn: () => getBlocked(),
  });

  const { data: freshness } = useQuery({
    queryKey: ["my-calendar-freshness", user?.id],
    enabled: !!user && profile?.user_type === "freelancer",
    queryFn: () => getFresh(),
  });

  const confirmMut = useMutation({
    mutationFn: () => confirmCal(),
    onSuccess: () => {
      toast.success(t("calendar.confirm_success", { defaultValue: "Availability confirmed. You keep top visibility in matches." }));
      qc.invalidateQueries({ queryKey: ["my-calendar-freshness"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_public.dashboard_calendar.save_failed")),
  });

  const lastConfirmed = freshness?.calendar_last_confirmed_at ? new Date(freshness.calendar_last_confirmed_at) : null;
  const daysSince = lastConfirmed ? Math.floor((Date.now() - lastConfirmed.getTime()) / 86400000) : null;
  const state = freshness?.state ?? "fresh";
  const freshTone =
    state === "unconfirmed" ? "text-racing-yellow" : state === "needs_review" ? "text-racing-yellow" : "text-[#16a34a]";

  const blockedSet = new Set(blockedDays);
  const selectedDates = myDays
    .filter((d: string) => !blockedSet.has(d))
    .map((d: string) => new Date(d + "T00:00:00"));
  const blockedDates = blockedDays.map((d: string) => new Date(d + "T00:00:00"));
  const unconfirmedDates = (freshness?.unconfirmed_days ?? []).map((d: string) => new Date(d + "T00:00:00"));

  const mutation = useMutation({
    mutationFn: async (dates: Date[] | undefined) => {
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const next = (dates ?? []).filter((d) => !blockedSet.has(fmt(d)));
      const currentSet = new Set(myDays.filter((d: string) => !blockedSet.has(d)));
      const nextSet = new Set(next.map(fmt));
      const toAdd = [...nextSet].filter((d) => !currentSet.has(d));
      const toRemove = [...currentSet].filter((d) => !nextSet.has(d));
      if (toAdd.length) await setAvail({ data: { dates: toAdd, add: true } });
      if (toRemove.length) await setAvail({ data: { dates: toRemove, add: false } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-availability"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_public.dashboard_calendar.save_failed")),
  });

  if (profile?.user_type !== "freelancer") {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
        <div className="container-page py-12 text-sm text-muted-foreground">{t("sweep_public.dashboard_calendar.redirecting")}</div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page py-12">
        <div className="label-mono">[{t("calendar.label")}]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("calendar.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("calendar.instructions_freelancer")}</p>
        <p className="mt-1 font-mono text-xs text-racing-red">{t("calendar.available_days", { count: myDays.filter((d: string) => !blockedSet.has(d)).length })}</p>

        <div className="mt-6 flex flex-wrap items-center gap-4 border border-border bg-card p-4">
          <div className="flex-1 min-w-[220px]">
            <div className="label-mono">[{t("calendar.freshness_label")}]</div>

            <div className={`mt-1 font-mono text-xs ${freshTone}`}>
              {lastConfirmed
                ? t("calendar.last_confirmed", {
                    defaultValue: "Last confirmed {{days}} day(s) ago · {{date}}",
                    days: daysSince,
                    date: formatDate(lastConfirmed),
                  })
                : t("calendar.never_confirmed", { defaultValue: "Never confirmed yet" })}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {state === "unconfirmed"
                ? t("calendar.state_unconfirmed", {
                    defaultValue:
                      "We've temporarily stopped using {{count}} of your dates for matching because we can't be sure they're still current. Review them anytime to make them active again.",
                    count: freshness?.unconfirmed_days?.length ?? 0,
                  })
                : state === "needs_review"
                  ? t("calendar.state_needs_review", {
                      defaultValue: "Some of your available dates haven't been reviewed recently.",
                    })
                  : t("calendar.freshness_benefit", {
                      defaultValue: "Your availability is up to date. Thanks for keeping it accurate.",
                    })}
            </p>
          </div>
          <button
            onClick={() => confirmMut.mutate()}
            disabled={confirmMut.isPending}
            className="bg-racing-yellow px-4 py-3 text-xs font-black uppercase tracking-widest text-carbon hover:brightness-110 disabled:opacity-40"
          >
            {confirmMut.isPending
              ? t("common.loading")
              : t("calendar.confirm_button", { defaultValue: "Everything is still correct — Confirm" })}
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-widest">
          <span className="flex items-center gap-2"><span className="inline-block size-3 border border-border bg-[#0a0a0a]" /> {t("sweep_public.dashboard_calendar.legend_unavailable")}</span>
          <span className="flex items-center gap-2"><span className="inline-block size-3 bg-[#16a34a]" /> {t("sweep_public.dashboard_calendar.legend_available")}</span>
          <span className="flex items-center gap-2"><span className="inline-block size-3 bg-racing-red" /> {t("sweep_public.dashboard_calendar.legend_engaged")}</span>
        </div>

        <div className="mt-6">
          <CalendarSourcePicker
            className="mb-3"
            value={selectedDates.map(isoOf)}
            onChange={(dates) => mutation.mutate(dates.map(dateOf))}
            saveLabel={t("sweep_public.dashboard_calendar.save_availability_label")}
          />
          <AvailabilityCalendar
            selected={selectedDates}
            blocked={blockedDates}
            onSelect={(d) => mutation.mutate(d)}
            min={new Date()}
            legend={t("sweep_public.dashboard_calendar.calendar_legend")}
          />
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
