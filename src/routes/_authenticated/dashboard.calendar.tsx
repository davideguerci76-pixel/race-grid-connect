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

export const Route = createFileRoute("/_authenticated/dashboard/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
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
    if (profile && profile.user_type === "team") navigate({ to: "/dashboard/requests" });
  }, [profile, navigate]);

  const getAvail = useServerFn(getMyAvailability);
  const getBlocked = useServerFn(getMyBlockedDates);
  const setAvail = useServerFn(setAvailability);

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

  const blockedSet = new Set(blockedDays);
  const selectedDates = myDays
    .filter((d: string) => !blockedSet.has(d))
    .map((d: string) => new Date(d + "T00:00:00"));
  const blockedDates = blockedDays.map((d: string) => new Date(d + "T00:00:00"));

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
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (profile?.user_type !== "freelancer") {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="container-page py-12 text-sm text-muted-foreground">Redirecting…</div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="label-mono">[CALENDAR]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("calendar.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("calendar.instructions_freelancer")}</p>
        <p className="mt-1 font-mono text-xs text-racing-red">{t("calendar.available_days", { count: myDays.filter((d: string) => !blockedSet.has(d)).length })}</p>

        <div className="mt-4 flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-widest">
          <span className="flex items-center gap-2"><span className="inline-block size-3 border border-border bg-[#0a0a0a]" /> Unavailable</span>
          <span className="flex items-center gap-2"><span className="inline-block size-3 bg-[#16a34a]" /> Available</span>
          <span className="flex items-center gap-2"><span className="inline-block size-3 bg-racing-red" /> Engaged (locked)</span>
        </div>

        <div className="mt-6">
          <AvailabilityCalendar
            selected={selectedDates}
            blocked={blockedDates}
            onSelect={(d) => mutation.mutate(d)}
            min={new Date()}
            legend="Click a day to toggle availability. Red = confirmed match, cannot be edited."
          />
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
