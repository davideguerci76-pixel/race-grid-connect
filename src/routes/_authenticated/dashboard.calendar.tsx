import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PitcallCalendar, CalendarStat, CalendarLegendDot, type PitcallDayCell } from "@/components/pitcall-calendar";
import { setAvailability, getMyAvailability, getMyBlockedDates, getMyFrozenDates, confirmMyCalendar, getMyCalendarFreshness } from "@/lib/paddock.functions";
import {
  getMyDayNotes,
  getMyEngagementDays,
  setMyDayNote,
  applySavedCalendarAsBusy,
  applyCalendarLabelAsAvailable,
  restoreMyDayNotes,
  type CalendarDayNote,
} from "@/lib/calendar-notes.functions";

import { BackButton } from "@/components/back-button";
import { CalendarPlus } from "lucide-react";
import { HelpHint } from "@/components/help-hint";
import { CalendarAddDialog } from "@/components/calendar-add-dialog";
import { CalendarTools } from "@/components/calendar-tools";
import { dateOf, isoOf } from "@/lib/ics";
import { calendarDayState, chunkDays } from "@/lib/calendar-days";
import { useDateFormat } from "@/lib/date-locale";
import { toastError } from "@/lib/errors";
import { useActivationStatus, ACTIVATION_QUERY_KEY } from "@/hooks/use-activation-status";
import { roleGroupLabel, subRoleLabel } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/dashboard/calendar")({
  component: CalendarPage,
  validateSearch: (search: Record<string, unknown>): { m?: string; days?: string } => {
    const m = typeof search.m === "string" && /^\d{4}-\d{2}$/.test(search.m) ? search.m : undefined;
    const days = typeof search.days === "string" && search.days.split(",").every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)) ? search.days : undefined;
    return m || days ? { ...(m ? { m } : {}), ...(days ? { days } : {}) } : {};
  },
});

/** Month to open on, from the optional ?m=YYYY-MM search param (view-only). */
function initialMonth(m?: string): Date {
  if (m) {
    const [y, mo] = m.split("-").map(Number);
    if (y && mo >= 1 && mo <= 12) return new Date(y, mo - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

const btn =
  "inline-flex items-center gap-2 border border-border bg-background px-3 py-2 font-mono text-[10px] uppercase tracking-widest hover:border-racing-red hover:text-racing-red transition-colors";

function CalendarPage() {
  const { t } = useTranslation();
  const { formatDate } = useDateFormat();
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
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
  const getFrozen = useServerFn(getMyFrozenDates);
  const setAvail = useServerFn(setAvailability);
  const getFresh = useServerFn(getMyCalendarFreshness);
  const confirmCal = useServerFn(confirmMyCalendar);
  const getNotes = useServerFn(getMyDayNotes);
  const getEngDays = useServerFn(getMyEngagementDays);
  const saveNote = useServerFn(setMyDayNote);
  const applyBusy = useServerFn(applySavedCalendarAsBusy);
  const applyLabel = useServerFn(applyCalendarLabelAsAvailable);
  const restoreNotes = useServerFn(restoreMyDayNotes);


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
  const { data: frozenDays = [] } = useQuery({
    queryKey: ["my-frozen-dates", user?.id],
    enabled: !!user && isFreelancer,
    queryFn: () => getFrozen(),
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

  const [month, setMonth] = useState(() => initialMonth(search.m));
  const [selected, setSelected] = useState<string | null>(() => isoOf(new Date()));
  const [noteDraft, setNoteDraft] = useState("");
  const [busyDialog, setBusyDialog] = useState<{
    kind: "busy" | "available";
    dates: string[];
    label: string;
    conflicts: Array<{ day: string; note: string }>;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  /**
   * Single-level undo. `availability` is the whole pre-change availability set;
   * `notes` (when present) is the exact pre-change note state of the days that a
   * bulk operation touched ("" = there was no note on that day).
   */
  const [undoSnapshot, setUndoSnapshot] = useState<{ availability: string[]; notes: CalendarDayNote[] | null } | null>(null);

  const inFlightRef = useRef(0);
  const expectedRef = useRef<string[] | null>(null);
  const hotPartialDays = useMemo(() => new Set((search.days ?? "").split(",").filter(Boolean)), [search.days]);
  /** Brief highlight of the MARK AVAILABLE/UNAVAILABLE action after tapping a noted day. */
  const [actionFlash, setActionFlash] = useState(false);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); }, []);

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
  /** FROZEN GREEN: still available (other teams can match them) but locked while a Request Confirmation is pending. */
  const frozenSet = useMemo(() => new Set((frozenDays as string[]).filter((d) => !blockedSet.has(d))), [frozenDays, blockedSet]);
  /** Red days: blocked (late-cancel lock) + confirmed engagement days. Never editable, never written.
   *  Frozen green days join them for write purposes only: they stay green, but cannot be removed. */
  const protectedSet = useMemo(
    () => new Set<string>([...blockedSet, ...engMap.keys(), ...frozenSet]),
    [blockedSet, engMap, frozenSet],
  );

  const cells = useMemo(() => {
    const map = new Map<string, PitcallDayCell>();
    // Only a note with busy = true makes a day Busy. A busy = false note is a
    // private label (it can sit on an available day, or survive a Replace).
    const noted = new Set([...noteMap.values()].filter((n) => n.busy).map((n) => n.day));
     const all = new Set<string>([...engMap.keys(), ...blockedSet, ...availableSet, ...noteMap.keys(), ...frozenSet, ...hotPartialDays]);
     for (const day of all) {
      const state = calendarDayState(day, { available: availableSet, blocked: blockedSet, engagements: engMap, noted });
      if (state === "locked") {
        map.set(day, { state, label: t("pcal.locked", { defaultValue: "LOCKED" }), highlighted: hotPartialDays.has(day), disabled: true });
      } else if (state === "engagement") {
        const e = engMap.get(day);
         map.set(day, {
           state,
           label: (e ? [e.team, e.location].filter(Boolean).join(" · ") : "") || t("pcal.pitcall", { defaultValue: "PITCALL" }),
           highlighted: hotPartialDays.has(day),
           disabled: true,
         });
      } else if (state === "available") {
        const frozen = frozenSet.has(day);
        map.set(day, {
          state,
          label: noteMap.get(day)?.note ?? (frozen ? t("pcal.frozen", { defaultValue: "REQUESTED" }) : null),
          unconfirmed: unconfirmedSet.has(day),
          highlighted: hotPartialDays.has(day),
          disabled: frozen,
        });
       } else if (state === "busy") {
         map.set(day, { state, label: noteMap.get(day)?.note ?? null, highlighted: hotPartialDays.has(day) });
       } else if (noteMap.has(day)) {
         // Not available, note with busy = false: neutral day carrying a private label.
         map.set(day, { state: "none", label: noteMap.get(day)?.note ?? null, highlighted: hotPartialDays.has(day) });
       } else if (hotPartialDays.has(day)) {
         map.set(day, { state: "none", highlighted: true });
      }

    }
    return map;
  }, [engMap, availableSet, noteMap, unconfirmedSet, blockedSet, frozenSet, hotPartialDays, t]);

  const confirmMut = useMutation({
    mutationFn: () => confirmCal(),
    onSuccess: () => {
      toast.success(t("calendar.confirm_success", { defaultValue: "Availability confirmed." }));
      qc.invalidateQueries({ queryKey: ["my-calendar-freshness"] });
      qc.invalidateQueries({ queryKey: [ACTIVATION_QUERY_KEY] });
    },
    onError: (e) => toastError(e, "sweep_public.dashboard_calendar.save_failed"),
  });

  const mutation = useMutation({
    mutationFn: async (vars: { nextSet: Set<string>; isUndo?: boolean; base?: string[] }) => {
      // Diff against the state captured in onMutate (never against the optimistic cache).
      const base = vars.base ?? (qc.getQueryData<string[]>(["my-availability", user?.id]) ?? []);
      const currentSet = new Set(base.filter((d) => !protectedSet.has(d)));
      const target = new Set([...vars.nextSet].filter((d) => !protectedSet.has(d)));
      const toAdd = [...target].filter((d) => !currentSet.has(d));
      const toRemove = [...currentSet].filter((d) => !target.has(d));
      // Large operations are sent in bounded, idempotent batches: no implicit
      // 400-day ceiling, and a retry can never double-apply.
      const skipped: string[] = [];
      for (const batch of chunkDays(toAdd)) {
        const res = await setAvail({ data: { dates: batch, add: true } });
        skipped.push(...((res?.skipped ?? []) as string[]));
      }
      for (const batch of chunkDays(toRemove)) {
        const res = await setAvail({ data: { dates: batch, add: false } });
        skipped.push(...((res?.skipped ?? []) as string[]));
      }
      return { skipped: [...new Set(skipped)] };
    },

    onMutate: async (vars) => {
      const { nextSet, isUndo } = vars;
      const key = ["my-availability", user?.id];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<string[]>(key) ?? [];
      // Same object reference reaches mutationFn: give it the pre-change baseline.
      vars.base = previous;
      const optimistic = [
        ...new Set([...previous.filter((d) => protectedSet.has(d)), ...[...nextSet].filter((d) => !protectedSet.has(d))]),
      ].sort();
      qc.setQueryData(key, optimistic);
      // Single-level undo: keep the state before the first change of a rapid burst.
      if (isUndo) {
        setUndoSnapshot(null);
      } else if (inFlightRef.current === 0) {
        setUndoSnapshot({ availability: previous, notes: null });
      }
      inFlightRef.current += 1;
      expectedRef.current = optimistic;
      return { previous };
    },

    // Protected days are authoritative server-side and are silently skipped:
    // tell the user how many days stayed untouched instead of leaving a gap.
    onSuccess: (res) => {
      const n = res?.skipped?.length ?? 0;
      if (n > 0) {
        toast.info(
          t("pcal.protected_skipped", {
            count: n,
            defaultValue: "{{count}} day(s) were not changed: confirmed PITCALL or locked days.",
          }),
        );
      }
    },

    onError: (e, _v, context) => {
      if (context?.previous) qc.setQueryData(["my-availability", user?.id], context.previous);
      setUndoSnapshot(null);
      toastError(e, "sweep_public.dashboard_calendar.save_failed");
    },
    onSettled: () => {
      inFlightRef.current = Math.max(0, inFlightRef.current - 1);
      qc.invalidateQueries({ queryKey: ["my-availability"] });
      qc.invalidateQueries({ queryKey: [ACTIVATION_QUERY_KEY] });
    },
  });

  /**
   * Restore the exact pre-change snapshot: availability, plus (for bulk Busy)
   * the previous note state of the touched days only. Protected days are never
   * part of the snapshot and are never rewritten.
   */
  const undoLastChange = async () => {
    if (!undoSnapshot || mutation.isPending) return;
    const snapshot = undoSnapshot;
    setUndoSnapshot(null);
    try {
      if (snapshot.notes) {
        await restoreNotes({ data: { entries: snapshot.notes.map((n) => ({ day: n.day, note: n.note, busy: n.busy })) } });
        qc.invalidateQueries({ queryKey: ["my-day-notes"] });
      }
    } catch (e) {
      toastError(e, "sweep_public.dashboard_calendar.save_failed");
      return;
    }
    mutation.mutate(
      { nextSet: new Set(snapshot.availability.filter((d) => !protectedSet.has(d))), isUndo: true },
      { onSuccess: () => toast.success(t("pcal.tools.undo_toast", { defaultValue: "Availability restored" })) },
    );
  };


  /** Drop a stale snapshot when an external refetch really changed the availability. */
  useEffect(() => {
    if (inFlightRef.current > 0 || !undoSnapshot) return;
    const expected = expectedRef.current;
    if (!expected) return;
    const current = [...(myDays as string[])].sort();
    const same = current.length === expected.length && current.every((d, i) => d === expected[i]);
    if (!same) setUndoSnapshot(null);
  }, [myDays, undoSnapshot]);

  /** Replace the whole availability set (protected days preserved). */
  const replaceDates = (dates: string[]) => {
    mutation.mutate({ nextSet: new Set(dates.filter((d) => !protectedSet.has(d))) });
  };

  /** Merge dates into the current availability set. */
  const mergeDates = (dates: string[]) => {
    mutation.mutate({ nextSet: new Set([...availableSet, ...dates.filter((d) => !protectedSet.has(d))]) });
  };


  /** Day selection: noted days get a brief action highlight + mobile scroll to the detail panel. */
  const handleSelectDay = (iso: string) => {
    setSelected(iso);
    if (protectedSet.has(iso) || !noteMap.has(iso)) return;
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setActionFlash(false);
    requestAnimationFrame(() => setActionFlash(true));
    flashTimerRef.current = setTimeout(() => setActionFlash(false), 1500);
    // Mobile: the detail panel sits below the grid — bring it (and the correct action) into view.
    if (window.innerWidth < 768) {
      setTimeout(() => {
        const el = detailPanelRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const visible = rect.top >= 0 && rect.bottom <= window.innerHeight;
        if (!visible) {
          const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
        }
      }, 60);
    }
  };

  /** Quick tap toggle: only for days without a private note. Noted days are protected. */
  const toggleDay = (iso: string) => {
    if (protectedSet.has(iso)) return;
    if (noteMap.has(iso)) return; // noted day: change only via explicit detail action
    const next = new Set(availableSet);
    if (next.has(iso)) next.delete(iso);
    else next.add(iso);
    mutation.mutate({ nextSet: next });
  };

  /** Explicit availability change from the detail panel. The private note is preserved. */
  const setDayAvailability = (iso: string, available: boolean) => {
    if (protectedSet.has(iso)) return;
    const next = new Set(availableSet);
    if (available) next.add(iso);
    else next.delete(iso);
    mutation.mutate({ nextSet: next });
    const existing = noteMap.get(iso);
    if (existing && existing.busy === available) {
      noteMut.mutate({ day: iso, note: existing.note, busy: !available });
    }
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

  /** Pre-change note state of the given days ("" = no note there before). */
  const noteSnapshotFor = (dates: string[]): CalendarDayNote[] =>
    dates
      .filter((d) => !protectedSet.has(d))
      .map((day) => noteMap.get(day) ?? { day, note: "", busy: false });

  const busyMut = useMutation({
    mutationFn: (vars: { dates: string[]; label: string; overwrite: boolean }) =>
      applyBusy({ data: vars }),
    onSuccess: (res, vars) => {
      if (res.conflicts.length && !vars.overwrite) {
        setBusyDialog((prev) => (prev ? { ...prev, conflicts: res.conflicts.map((c) => ({ day: c.day, note: c.note })) } : prev));
        return;
      }
      // Bulk Busy joins the single-level undo: availability set before the change
      // plus the exact previous note state of the days it touched.
      setUndoSnapshot({ availability: [...(myDays as string[])], notes: noteSnapshotFor(vars.dates) });
      expectedRef.current = null;
      setBusyDialog(null);
      qc.invalidateQueries({ queryKey: ["my-day-notes"] });
      qc.invalidateQueries({ queryKey: ["my-availability"] });
      toast.success(t("pcal.busy_applied", { defaultValue: "{{count}} day(s) marked as busy", count: res.applied }));
      if (res.skipped > 0) {
        toast.info(t("pcal.protected_skipped", { count: res.skipped, defaultValue: "{{count}} day(s) were not changed: confirmed PITCALL or locked days." }));
      }
    },
    onError: (e) => toastError(e, "sweep_public.dashboard_calendar.save_failed"),
  });

  /** Private label on days that stay AVAILABLE (no availability is removed). */
  const labelMut = useMutation({
    mutationFn: (vars: { dates: string[]; label: string; overwrite: boolean }) => applyLabel({ data: vars }),
    onSuccess: (res, vars) => {
      if (res.conflicts.length && !vars.overwrite) {
        // Reuse the existing conflict dialog even when the flow started from ADD FROM CALENDAR.
        setBusyDialog({
          kind: "available",
          dates: vars.dates,
          label: vars.label,
          conflicts: res.conflicts.map((c) => ({ day: c.day, note: c.note })),
        });

        return;
      }
      // Attach the exact pre-change note state of the touched days to the
      // single-level undo snapshot (the merge/replace mutation created it with
      // notes: null). "" entries mean "no note before" → Undo deletes a note
      // created ex novo. Availability part of the snapshot is left untouched.
      setUndoSnapshot((prev) => (prev ? { ...prev, notes: noteSnapshotFor(vars.dates) } : prev));
      setBusyDialog(null);
      qc.invalidateQueries({ queryKey: ["my-day-notes"] });
      toast.success(t("pcal.note_saved", { defaultValue: "Private note saved" }));
      if (res.skipped > 0) {
        toast.info(t("pcal.protected_skipped", { count: res.skipped, defaultValue: "{{count}} day(s) were not changed: confirmed PITCALL or locked days." }));
      }
    },
    onError: (e) => toastError(e, "sweep_public.dashboard_calendar.save_failed"),
  });


  useEffect(() => {
    setNoteDraft(selected ? (noteMap.get(selected)?.note ?? "") : "");
  }, [selected, noteMap]);

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
            <div className="flex items-center gap-1">
              <span className="label-mono">[{t("calendar.freshness_label")}]</span>
              <HelpHint titleKey="help.concept.stale_calendar.title" bodyKey="help.concept.stale_calendar.body" />
            </div>
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
            onSelectDay={handleSelectDay}
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
                  month={month}
                  selectedDay={selected}
                  canUndo={!!undoSnapshot}
                  onUndo={undoLastChange}
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
                <div ref={detailPanelRef} className="min-w-0 space-y-3">
                  <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    {formatDate(dateOf(selected))}
                  </div>
                  {selectedEng ? (
                    <div className="min-w-0 space-y-1 text-sm">
                      <div className="font-black uppercase tracking-tight text-racing-red">
                        {selectedEng.locked ? t("pcal.locked", { defaultValue: "LOCKED" }) : selectedEng.team || t("pcal.pitcall", { defaultValue: "PITCALL" })}
                      </div>
                      {!selectedEng.locked && (
                        <>
                          {selectedEng.location && (
                            <div className="break-words text-muted-foreground">
                              <span className="font-mono text-[10px] uppercase tracking-widest">{t("pcal.detail_location", { defaultValue: "Location" })}: </span>
                              {selectedEng.location}
                            </div>
                          )}
                          {(selectedEng.sub_role || selectedEng.role) && (
                            <div className="break-words text-muted-foreground">
                              <span className="font-mono text-[10px] uppercase tracking-widest">{t("pcal.detail_role", { defaultValue: "Role" })}: </span>
                              {selectedEng.sub_role
                                ? subRoleLabel(selectedEng.sub_role)
                                : roleGroupLabel(selectedEng.role as string)}
                            </div>
                          )}
                        </>
                      )}
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {t("pcal.non_editable", { defaultValue: "Confirmed PITCALL · non-editable" })}
                      </div>
                      {!selectedEng.locked && selectedEng.engagement_id && (
                        <a
                          href={`/dashboard/engagements#engagement-${selectedEng.engagement_id}`}
                          className={`${btn} mt-2`}
                        >
                          {t("pcal.view_engagement", { defaultValue: "View engagement" })}
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="min-w-0 space-y-3">
                      <div className="font-mono text-[11px] uppercase tracking-widest">
                        {selectedCell?.state === "available"
                          ? t("pcal.legend_available", { defaultValue: "Available" })
                          : t("pcal.legend_busy", { defaultValue: "Busy / private" })}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={`${btn} ${actionFlash && noteMap.has(selected) ? "pcal-action-pulse" : ""}`}
                          disabled={!selectedEditable || mutation.isPending}
                          onClick={() => setDayAvailability(selected, selectedCell?.state !== "available")}
                        >
                          {selectedCell?.state === "available"
                            ? t("pcal.mark_unavailable", { defaultValue: "Mark unavailable" })
                            : t("pcal.mark_available", { defaultValue: "Mark available" })}
                        </button>
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

      <CalendarAddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        currentAvailable={[...availableSet].sort()}
        protectedDays={protectedSet}
        pending={mutation.isPending || busyMut.isPending || labelMut.isPending}
        onApplyAvailable={(dates, mode, label) => {
          if (mode === "replace") replaceDates(dates);
          else mergeDates(dates);
          // Optional private label on the days that stay available.
          if (label) labelMut.mutate({ dates, label, overwrite: false });
        }}
        onApplyBusy={(dates, label) => setBusyDialog({ kind: "busy", dates, label, conflicts: [] })}
      />

      {busyDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-3">
          <div className="w-full max-w-md min-w-0 border border-border bg-card p-4">
            <div className="label-mono">
              [
              {busyDialog.kind === "busy"
                ? t("pcal.mark_as_busy", { defaultValue: "Mark saved calendar as busy" })
                : t("pcal.add.available_label", { defaultValue: "Private note used on those days (optional)" })}
              ]
            </div>

            <input
              value={busyDialog.label}
              maxLength={60}
              onChange={(e) => setBusyDialog({ ...busyDialog, label: e.target.value })}
              className="mt-3 w-full min-w-0 border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              {busyDialog.kind === "busy"
                ? t("pcal.busy_hint", { defaultValue: "All editable dates of this calendar turn black with this label. PITCALL dates are never overwritten." })
                : t("pcal.add.available_label_hint", {
                    defaultValue:
                      "Leave it as is, edit it or clear it. If empty, the days stay available with no private note. Never shared with Teams.",
                  })}
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
                  disabled={busyMut.isPending || labelMut.isPending}
                  onClick={() => {
                    const skip = new Set(busyDialog.conflicts.map((c) => c.day));
                    const vars = { dates: busyDialog.dates.filter((d) => !skip.has(d)), label: busyDialog.label, overwrite: true };
                    if (busyDialog.kind === "busy") busyMut.mutate(vars);
                    else labelMut.mutate(vars);
                  }}
                >
                  {t("pcal.keep_existing", { defaultValue: "Keep existing" })}
                </button>
              )}
              <button
                type="button"
                className="bg-racing-red px-3 py-2 font-mono text-[10px] font-black uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-40"
                disabled={busyMut.isPending || labelMut.isPending || !busyDialog.label.trim()}
                onClick={() => {
                  const vars = { dates: busyDialog.dates, label: busyDialog.label, overwrite: busyDialog.conflicts.length > 0 };
                  if (busyDialog.kind === "busy") busyMut.mutate(vars);
                  else labelMut.mutate(vars);
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
