import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PitcallCalendar, CalendarStat, CalendarLegendDot, type PitcallDayCell } from "@/components/pitcall-calendar";
import { setAvailability, getMyAvailability, getMyBlockedDates, confirmMyCalendar, getMyCalendarFreshness } from "@/lib/paddock.functions";
import { getMyDayNotes, getMyEngagementDays, setMyDayNote, applySavedCalendarAsBusy } from "@/lib/calendar-notes.functions";
import { listMyCalendars, type UserCalendar } from "@/lib/calendars.functions";
import { BackButton } from "@/components/back-button";
import { CalendarPlus } from "lucide-react";
import { CalendarAddDialog } from "@/components/calendar-add-dialog";
import { CalendarTools } from "@/components/calendar-tools";
import { dateOf, isoOf } from "@/lib/ics";
import { useDateFormat } from "@/lib/date-locale";
import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/dashboard/calendar")({
  component: CalendarPage,
});

const btn =
  "inline-flex items-center gap-2 border border-border bg-background px-3 py-2 font-mono text-[10px] uppercase tracking-widest hover:border-racing-red hover:text-racing-red transition-colors";

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
    if (profile && profile.user_type === "team") navigate({ to: "/dashboard/team-calendar" });
  }, [profile, navigate]);

  const isFreelancer = profile?.user_type === "freelancer";

  const getAvail = useServerFn(getMyAvailability);
  const getBlocked = useServerFn(getMyBlockedDates);
  const setAvail = useServerFn(setAvailability);
  const getFresh = useServerFn(getMyCalendarFreshness);
  const confirmCal = useServerFn(confirmMyCalendar);
  const getNotes = useServerFn(getMyDayNotes);
  const getEngDays = useServerFn(getMyEngagementDays);
  const saveNote = useServerFn(setMyDayNote);
  const applyBusy = useServerFn(applySavedCalendarAsBusy);
  const listCals = useServerFn(listMyCalendars);

  const { data: myDays = [] } = useQuery({
    queryKey: ["my-availability", user?.id],
    enabled: !!user && isFreelancer,
    queryFn: () => getAvail(),
  });
  const { data: blockedDays = [] } = useQuery({
    queryKey: ["my-blocked-dates", user?.id],
    enabled: !!user && isFreelancer,
    queryFn: () => getBlocked(),
  });
  const { data: freshness } = useQuery({
    queryKey: ["my-calendar-freshness", user?.id],
    enabled: !!user && isFreelancer,
    queryFn: () => getFresh(),
  });
  const { data: notes = [] } = useQuery({
    queryKey: ["my-day-notes", user?.id],
    enabled: !!user && isFreelancer,
    queryFn: () => getNotes(),
  });
  const { data: engDays = [] } = useQuery({
    queryKey: ["my-engagement-days", user?.id],
    enabled: !!user && isFreelancer,
    queryFn: () => getEngDays(),
  });
  const { data: calendars } = useQuery({
    queryKey: ["my-calendars"],
    enabled: !!user && isFreelancer,
    queryFn: () => listCals(),
  });

  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(() => isoOf(new Date()));
  const [noteDraft, setNoteDraft] = useState("");
  const [busyDialog, setBusyDialog] = useState<{ dates: string[]; label: string; conflicts: Array<{ day: string; note: string }> } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const blockedSet = useMemo(() => new Set(blockedDays as string[]), [blockedDays]);
  const availableSet = useMemo(
    () => new Set((myDays as string[]).filter((d) => !blockedSet.has(d))),
    [myDays, blockedSet],
  );
  const noteMap = useMemo(() => new Map(notes.map((n) => [n.day, n])), [notes]);
  const engMap = useMemo(() => {
    const m = new Map<string, (typeof engDays)[number]>();
    for (const e of engDays) if (!m.has(e.day) || (!e.locked && m.get(e.day)!.locked)) m.set(e.day, e);
    return m;
  }, [engDays]);
  const unconfirmedSet = useMemo(() => new Set(freshness?.unconfirmed_days ?? []), [freshness]);
  /** Red days: blocked (late-cancel lock) + confirmed engagement days. Never editable, never written. */
  const protectedSet = useMemo(() => new Set<string>([...blockedSet, ...engMap.keys()]), [blockedSet, engMap]);

  const cells = useMemo(() => {
    const map = new Map<string, PitcallDayCell>();
    for (const [day, e] of engMap) {
      map.set(day, {
        state: e.locked ? "locked" : "engagement",
        label: e.locked ? t("pcal.locked", { defaultValue: "LOCKED" }) : [e.team, e.location].filter(Boolean).join(" · ") || t("pcal.pitcall", { defaultValue: "PITCALL" }),
        disabled: true,
      });
    }
    for (const day of availableSet) {
      if (map.has(day)) continue;
      map.set(day, { state: "available", label: noteMap.get(day)?.note ?? null, unconfirmed: unconfirmedSet.has(day) });
    }
    for (const [day, n] of noteMap) {
      if (map.has(day)) continue;
      map.set(day, { state: "busy", label: n.note });
    }
    for (const day of blockedSet) if (!map.has(day)) map.set(day, { state: "engagement", disabled: true, label: t("pcal.pitcall", { defaultValue: "PITCALL" }) });
    return map;
  }, [engMap, availableSet, noteMap, unconfirmedSet, blockedSet, t]);

  const confirmMut = useMutation({
    mutationFn: () => confirmCal(),
    onSuccess: () => {
      toast.success(t("calendar.confirm_success", { defaultValue: "Availability confirmed." }));
      qc.invalidateQueries({ queryKey: ["my-calendar-freshness"] });
    },
    onError: (e) => toastError(e, "sweep_public.dashboard_calendar.save_failed"),
  });

  const mutation = useMutation({
    mutationFn: async ({ nextSet }: { nextSet: Set<string> }) => {
      // Protected (red) days are excluded from both sides: never added, never removed.
      const currentSet = new Set((myDays as string[]).filter((d) => !protectedSet.has(d)));
      const target = new Set([...nextSet].filter((d) => !protectedSet.has(d)));
      const toAdd = [...target].filter((d) => !currentSet.has(d));
      const toRemove = [...currentSet].filter((d) => !target.has(d));
      if (toAdd.length) await setAvail({ data: { dates: toAdd, add: true } });
      if (toRemove.length) await setAvail({ data: { dates: toRemove, add: false } });
    },
    onMutate: async ({ nextSet }) => {
      const key = ["my-availability", user?.id];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<string[]>(key) ?? [];
      const optimistic = [
        ...new Set([...previous.filter((d) => protectedSet.has(d)), ...[...nextSet].filter((d) => !protectedSet.has(d))]),
      ].sort();
      qc.setQueryData(key, optimistic);
      return { previous };
    },
    onError: (e, _v, context) => {
      if (context?.previous) qc.setQueryData(["my-availability", user?.id], context.previous);
      toastError(e, "sweep_public.dashboard_calendar.save_failed");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["my-availability"] }),
  });

  /** Replace the whole availability set (protected days preserved). */
  const replaceDates = (dates: string[]) => {
    mutation.mutate({ nextSet: new Set(dates.filter((d) => !protectedSet.has(d))) });
  };

  /** Merge dates into the current availability set. */
  const mergeDates = (dates: string[]) => {
    mutation.mutate({ nextSet: new Set([...availableSet, ...dates.filter((d) => !protectedSet.has(d))]) });
  };

  const toggleDay = (iso: string) => {
    if (protectedSet.has(iso)) return;
    const next = new Set(availableSet);
    if (next.has(iso)) next.delete(iso);
    else next.add(iso);
    mutation.mutate({ nextSet: next });
  };


  const noteMut = useMutation({
    mutationFn: (vars: { day: string; note: string; busy: boolean }) => saveNote({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-day-notes"] });
      qc.invalidateQueries({ queryKey: ["my-availability"] });
      toast.success(t("pcal.note_saved", { defaultValue: "Private note saved" }));
    },
    onError: (e) => toastError(e, "sweep_public.dashboard_calendar.save_failed"),
  });

  const busyMut = useMutation({
    mutationFn: (vars: { dates: string[]; label: string; overwrite: boolean }) =>
      applyBusy({ data: { ...vars, protectedDays: [...new Set([...blockedSet, ...engMap.keys()])] } }),
    onSuccess: (res, vars) => {
      if (res.conflicts.length && !vars.overwrite) {
        setBusyDialog((prev) => (prev ? { ...prev, conflicts: res.conflicts.map((c) => ({ day: c.day, note: c.note })) } : prev));
        return;
      }
      setBusyDialog(null);
      qc.invalidateQueries({ queryKey: ["my-day-notes"] });
      qc.invalidateQueries({ queryKey: ["my-availability"] });
      toast.success(t("pcal.busy_applied", { defaultValue: "{{count}} day(s) marked as busy", count: res.applied }));
    },
    onError: (e) => toastError(e, "sweep_public.dashboard_calendar.save_failed"),
  });

  useEffect(() => {
    setNoteDraft(selected ? (noteMap.get(selected)?.note ?? "") : "");
  }, [selected, noteMap]);

  const options: UserCalendar[] = [...(calendars?.mine ?? []), ...(calendars?.shared ?? [])];
  const lastConfirmed = freshness?.calendar_last_confirmed_at ? new Date(freshness.calendar_last_confirmed_at) : null;
  const daysSince = lastConfirmed ? Math.floor((Date.now() - lastConfirmed.getTime()) / 86400000) : null;
  const state = freshness?.state ?? "fresh";
  const freshTone = state === "fresh" ? "text-[#16a34a]" : "text-racing-yellow";

  const selectedCell = selected ? cells.get(selected) : undefined;
  const selectedEng = selected ? engMap.get(selected) : undefined;
  const selectedEditable = !!selected && !selectedEng && !blockedSet.has(selected);

  if (profile && !isFreelancer) {
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
      <div className="container-page py-8">
        <div className="label-mono">[{t("calendar.label")}]</div>
        <h1 className="text-3xl font-black uppercase italic tracking-tighter sm:text-4xl">{t("calendar.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("calendar.instructions_freelancer")}</p>

        <div className="mt-6 grid grid-cols-1 gap-3 border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <div className="label-mono">[{t("calendar.freshness_label")}]</div>
            <div className={`mt-1 font-mono text-xs ${freshTone}`}>
              {lastConfirmed
                ? t("calendar.last_confirmed", { defaultValue: "Last confirmed {{days}} day(s) ago · {{date}}", days: daysSince, date: formatDate(lastConfirmed) })
                : t("calendar.never_confirmed", { defaultValue: "Never confirmed yet" })}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {state === "unconfirmed"
                ? t("calendar.state_unconfirmed", { count: freshness?.unconfirmed_days?.length ?? 0, defaultValue: "Some dates are paused until you review them." })
                : state === "needs_review"
                  ? t("calendar.state_needs_review", { defaultValue: "Some of your available dates haven't been reviewed recently." })
                  : t("calendar.freshness_benefit", { defaultValue: "Your availability is up to date." })}
            </p>
          </div>
          <button
            onClick={() => confirmMut.mutate()}
            disabled={confirmMut.isPending}
            className="w-full bg-racing-yellow px-4 py-3 text-xs font-black uppercase tracking-widest text-carbon hover:brightness-110 disabled:opacity-40 sm:w-auto"
          >
            {confirmMut.isPending ? t("common.loading") : t("calendar.confirm_button", { defaultValue: "Everything is still correct — Confirm" })}
          </button>
        </div>

        <div className="mt-6">
          <PitcallCalendar
            month={month}
            onMonthChange={setMonth}
            cells={cells}
            selected={selected}
            onSelectDay={setSelected}
            onToggleDay={toggleDay}
            todayLabel={t("pcal.today", { defaultValue: "Today" })}
            actions={
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="inline-flex items-center gap-2 bg-racing-red px-4 py-2 font-mono text-[10px] font-black uppercase tracking-widest text-white hover:brightness-110"
                >
                  <CalendarPlus className="size-3.5" /> {t("pcal.add.cta", { defaultValue: "Add from calendar" })}
                </button>
                <CalendarTools
                  currentAvailable={[...availableSet].sort()}
                  protectedDays={protectedSet}
                  onReshape={(dates) => replaceDates(dates)}
                  pending={mutation.isPending}
                />
              </div>
            }
            legend={
              <>
                <CalendarLegendDot className="bg-[#16a34a]" label={t("pcal.legend_available", { defaultValue: "Available" })} />
                <CalendarLegendDot className="bg-[#20242b] border border-border" label={t("pcal.legend_busy", { defaultValue: "Busy / private" })} />
                <CalendarLegendDot className="bg-racing-red" label={t("pcal.legend_pitcall", { defaultValue: "PITCALL · non-editable" })} />
              </>
            }
            stats={
              <>
                <CalendarStat value={availableSet.size} label={t("pcal.stat_available", { defaultValue: "Available days" })} />
                <CalendarStat value={notes.filter((n) => n.busy).length} label={t("pcal.stat_busy", { defaultValue: "Busy days" })} />
                <CalendarStat value={engMap.size} label={t("pcal.stat_pitcall", { defaultValue: "PITCALL days" })} />
              </>
            }
            detail={
              selected ? (
                <div className="min-w-0 space-y-3">
                  <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    {formatDate(dateOf(selected))}
                  </div>
                  {selectedEng ? (
                    <div className="min-w-0 space-y-1 text-sm">
                      <div className="font-black uppercase tracking-tight text-racing-red">
                        {selectedEng.locked ? t("pcal.locked", { defaultValue: "LOCKED" }) : selectedEng.team || t("pcal.pitcall", { defaultValue: "PITCALL" })}
                      </div>
                      <div className="break-words text-muted-foreground">
                        {[selectedEng.sub_role ?? selectedEng.role, selectedEng.location].filter(Boolean).join(" · ")}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {t("pcal.non_editable", { defaultValue: "Confirmed PITCALL · non-editable" })}
                      </div>
                    </div>
                  ) : (
                    <div className="min-w-0 space-y-3">
                      <div className="font-mono text-[11px] uppercase tracking-widest">
                        {selectedCell?.state === "available"
                          ? t("pcal.legend_available", { defaultValue: "Available" })
                          : t("pcal.legend_busy", { defaultValue: "Busy / private" })}
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <input
                          value={noteDraft}
                          maxLength={60}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder={t("pcal.note_placeholder", { defaultValue: "Private note (e.g. F3 Open)" })}
                          className="w-full min-w-0 border border-border bg-background px-3 py-2 text-sm"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={btn}
                            disabled={!selectedEditable || noteMut.isPending}
                            onClick={() => noteMut.mutate({ day: selected, note: noteDraft, busy: selectedCell?.state !== "available" && !!noteDraft.trim() })}
                          >
                            {t("pcal.save_note", { defaultValue: "Save note" })}
                          </button>
                          <button
                            type="button"
                            className={btn}
                            disabled={!selectedEditable || !noteMap.has(selected)}
                            onClick={() => noteMut.mutate({ day: selected, note: "", busy: false })}
                          >
                            {t("pcal.remove_note", { defaultValue: "Remove" })}
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {t("pcal.note_privacy", { defaultValue: "Private note. Never shared with Teams and never used for matching." })}
                      </p>
                    </div>
                  )}
                </div>
              ) : null
            }
          />
        </div>
      </div>

      {busyDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-3">
          <div className="w-full max-w-md min-w-0 border border-border bg-card p-4">
            <div className="label-mono">[{t("pcal.mark_as_busy", { defaultValue: "Mark saved calendar as busy" })}]</div>
            <input
              value={busyDialog.label}
              maxLength={60}
              onChange={(e) => setBusyDialog({ ...busyDialog, label: e.target.value })}
              className="mt-3 w-full min-w-0 border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t("pcal.busy_hint", { defaultValue: "All editable dates of this calendar turn black with this label. PITCALL dates are never overwritten." })}
            </p>
            {busyDialog.conflicts.length > 0 && (
              <div className="mt-3 border border-racing-yellow/60 bg-racing-yellow/10 p-3">
                <div className="font-mono text-[10px] uppercase tracking-widest text-racing-yellow">
                  {t("pcal.conflicts_title", { defaultValue: "{{count}} day(s) already have a different busy note", count: busyDialog.conflicts.length })}
                </div>
                <ul className="mt-2 max-h-32 overflow-auto font-mono text-[11px] text-muted-foreground">
                  {busyDialog.conflicts.map((c) => (
                    <li key={c.day} className="truncate">{c.day} · {c.note}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className={btn} onClick={() => setBusyDialog(null)}>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </button>
              {busyDialog.conflicts.length > 0 && (
                <button
                  type="button"
                  className={btn}
                  disabled={busyMut.isPending}
                  onClick={() => {
                    const cal = options.find((c) => c.id === busyDialog.calendarId);
                    const skip = new Set(busyDialog.conflicts.map((c) => c.day));
                    busyMut.mutate({ dates: (cal?.dates ?? []).filter((d) => !skip.has(d)), label: busyDialog.label, overwrite: true });
                  }}
                >
                  {t("pcal.keep_existing", { defaultValue: "Keep existing" })}
                </button>
              )}
              <button
                type="button"
                className="bg-racing-red px-3 py-2 font-mono text-[10px] font-black uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-40"
                disabled={busyMut.isPending || !busyDialog.label.trim()}
                onClick={() => {
                  const cal = options.find((c) => c.id === busyDialog.calendarId);
                  busyMut.mutate({ dates: cal?.dates ?? [], label: busyDialog.label, overwrite: busyDialog.conflicts.length > 0 });
                }}
              >
                {busyDialog.conflicts.length > 0
                  ? t("pcal.overwrite", { defaultValue: "Overwrite" })
                  : t("pcal.apply", { defaultValue: "Apply" })}
              </button>
            </div>
          </div>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}
