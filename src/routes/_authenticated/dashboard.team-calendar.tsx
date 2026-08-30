import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BackButton } from "@/components/back-button";
import { PitcallCalendar, CalendarStat, CalendarLegendDot, type PitcallDayCell } from "@/components/pitcall-calendar";
import { getTeamCalendarDays } from "@/lib/calendar-notes.functions";
import { roleDisplay } from "@/lib/labels";
import { dateOf, isoOf } from "@/lib/ics";
import { useDateFormat } from "@/lib/date-locale";

export const Route = createFileRoute("/_authenticated/dashboard/team-calendar")({
  component: TeamCalendarPage,
});

function TeamCalendarPage() {
  const { t } = useTranslation();
  const { formatDate } = useDateFormat();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ["account-type", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("user_type").eq("id", user!.id).maybeSingle()).data,
  });

  useEffect(() => {
    if (profile && profile.user_type === "freelancer") navigate({ to: "/dashboard/calendar" });
  }, [profile, navigate]);

  const getDays = useServerFn(getTeamCalendarDays);
  const { data: rows = [] } = useQuery({
    queryKey: ["team-calendar-days", user?.id],
    enabled: !!user && profile?.user_type === "team",
    queryFn: () => getDays(),
  });

  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(() => isoOf(new Date()));

  const byDay = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) m.set(r.day, [...(m.get(r.day) ?? []), r]);
    return m;
  }, [rows]);

  const cells = useMemo(() => {
    const map = new Map<string, PitcallDayCell>();
    for (const [day, items] of byDay) {
      const first = items[0]!;
      map.set(day, {
        state: "engagement",
        disabled: true,
        count: items.length,
        label: [first.freelancer.split(" ")[0], first.location].filter(Boolean).join(" · "),
      });
    }
    return map;
  }, [byDay]);

  const detailItems = selected ? (byDay.get(selected) ?? []) : [];
  const freelancers = new Set(rows.map((r) => r.freelancer)).size;
  const pitcalls = new Set(rows.map((r) => r.request_id ?? r.engagement_id)).size;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page py-8">
        <div className="label-mono">[{t("pcal.team_label", { defaultValue: "Team operations · read-only" })}]</div>
        <h1 className="text-3xl font-black uppercase italic tracking-tighter sm:text-4xl">
          {t("pcal.team_title", { defaultValue: "Team calendar" })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("pcal.team_subtitle", { defaultValue: "Confirmed PITCALL engagements only." })}
        </p>

        <div className="mt-6">
          <PitcallCalendar
            month={month}
            onMonthChange={setMonth}
            cells={cells}
            selected={selected}
            onSelectDay={setSelected}
            todayLabel={t("pcal.today", { defaultValue: "Today" })}
            legend={<CalendarLegendDot className="bg-racing-red" label={t("pcal.legend_engagement", { defaultValue: "PITCALL engagement" })} />}
            stats={
              <>
                <CalendarStat value={rows.length} label={t("pcal.stat_crew_days", { defaultValue: "Crew days" })} />
                <CalendarStat value={freelancers} label={t("pcal.stat_freelancers", { defaultValue: "Freelancers" })} />
                <CalendarStat value={pitcalls} label={t("pcal.stat_pitcalls", { defaultValue: "Pit Calls" })} />
              </>
            }
            detail={
              selected ? (
                <div className="min-w-0">
                  <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    {formatDate(dateOf(selected))} ·{" "}
                    {t("pcal.detail_count", { defaultValue: "{{count}} freelancer(s)", count: detailItems.length })}
                  </div>
                  {detailItems.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("pcal.no_engagements", { defaultValue: "No confirmed engagements on this date." })}
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-border">
                      {detailItems.map((it) => (
                        <li key={it.engagement_id + it.day} className="min-w-0 py-2">
                          <div className="truncate text-sm font-black uppercase tracking-tight">{it.freelancer}</div>
                          <div className="break-words text-xs text-muted-foreground">
                            {[roleDisplay(it.role, it.sub_role), it.location, it.title]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                          <Link
                            to="/dashboard/engagements"
                            className="mt-1 inline-block font-mono text-[10px] uppercase tracking-widest text-racing-red hover:underline"
                          >
                            {t("pcal.open_engagement", { defaultValue: "Open engagement →" })}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null
            }
          />
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
