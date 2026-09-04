import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarPlus, Check, Download, ListChecks, Pencil, Trash2, Upload, X } from "lucide-react";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { CalendarQuickFillDialog } from "@/components/calendar-quick-fill";
import {
  adminApproveCalendar,
  adminDeleteCalendar,
  adminListCalendars,
  adminRejectCalendar,
  adminUpsertOfficialCalendar,
  type AdminCalendar,
} from "@/lib/admin-calendars.functions";
import { buildIcsFromEvents, checkCalendarLimits, daysToEvents, dateOf, isoOf, parseIcs, rangeDayCount, type CalendarEventItem, type CalendarLimitViolation } from "@/lib/ics";
import { downloadFile } from "@/lib/calendar-contacts";
import { useTranslation } from "react-i18next";
import { toastError } from "@/lib/errors";
import { confirmDialog } from "@/hooks/use-confirm";

export const Route = createFileRoute("/_authenticated/admin/calendars")({
  component: AdminCalendarsPage,
});

const btn =
  "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors hover:border-racing-red hover:text-racing-red";

function AdminCalendarsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useServerFn(adminListCalendars);
  const approve = useServerFn(adminApproveCalendar);
  const reject = useServerFn(adminRejectCalendar);
  const upsert = useServerFn(adminUpsertOfficialCalendar);
  const remove = useServerFn(adminDeleteCalendar);
  const fileRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState<{ id?: string; name: string; discipline: string; season: string; dates: string[]; source: "manual" | "ics" } | null>(null);
  const [quickEvents, setQuickEvents] = useState<CalendarEventItem[] | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["admin-calendars"], queryFn: () => list() });
  const rows: AdminCalendar[] = data ?? [];
  const pending = rows.filter((r) => r.review_status === "pending");
  const official = rows.filter((r) => r.review_status === "approved");
  const rejected = rows.filter((r) => r.review_status === "rejected");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-calendars"] });
  const fail = (e: unknown) => toastError(e, "sweep_admin_b.calendars.action_failed");

  const approveMut = useMutation({
    mutationFn: (v: { id: string; name?: string }) => approve({ data: v }),
    onSuccess: (res: any) => {
      toast.success(res?.credited ? t("sweep_admin_b.calendars.approved_credited", { count: res.credited }) : t("sweep_admin_b.calendars.approved"));
      invalidate();
    },
    onError: fail,
  });
  const rejectMut = useMutation({
    mutationFn: (v: { id: string; note?: string }) => reject({ data: v }),
    onSuccess: () => {
      toast.success(t("sweep_admin_b.calendars.rejected"));
      invalidate();
    },
    onError: fail,
  });
  const saveMut = useMutation({
    mutationFn: (v: { id?: string; name: string; discipline: string | null; season_year: number | null; dates: string[]; source: "manual" | "ics" }) =>
      upsert({ data: { ...v, events: daysToEvents(v.dates) } }),
    onSuccess: () => {
      toast.success(t("sweep_admin_b.calendars.saved"));
      setEditing(null);
      invalidate();
    },
    onError: fail,
  });
  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success(t("sweep_admin_b.calendars.deleted"));
      invalidate();
    },
    onError: fail,
  });

  const limitMessage = (v: CalendarLimitViolation) =>
    t(
      v.kind === "events"
        ? "sweep_admin_b.calendars.ics_too_many_events"
        : "sweep_admin_b.calendars.ics_too_many_days",
      { actual: v.actual, limit: v.limit },
    );

  const importIcs = async (file: File) => {
    try {
      const events = parseIcs(await file.text());
      if (!events.length) {
        toast.error(t("sweep_admin_b.calendars.no_events_found"));
        return;
      }
      const violation = checkCalendarLimits({ events });
      if (violation) {
        toast.error(limitMessage(violation));
        return;
      }
      setEditing({ name: file.name.replace(/\.ics$/i, ""), discipline: "", season: String(new Date(events[0]!.start).getFullYear()), dates: [], source: "ics" });
      setQuickEvents(events);
    } catch {
      toast.error(t("sweep_admin_b.calendars.could_not_read_ics"));
    }
  };

  const startEdit = (c: AdminCalendar) =>
    setEditing({
      id: c.id,
      name: c.name,
      discipline: c.discipline ?? "",
      season: c.season_year ? String(c.season_year) : "",
      dates: c.dates,
      source: (c.source as "manual" | "ics") ?? "manual",
    });

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => setEditing({ name: "", discipline: "", season: "", dates: [], source: "manual" })}>
          <CalendarPlus className="size-3.5" /> {t("sweep_admin_b.calendars.new_official_calendar")}
        </button>
        <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
          <Upload className="size-3.5" /> {t("sweep_admin_b.calendars.import_ics")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".ics,text/calendar"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importIcs(f);
            e.target.value = "";
          }}
        />
      </div>

      {editing && (
        <div className="card-surface rounded-2xl p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-racing-red">{editing.id ? t("sweep_admin_b.calendars.edit_official_calendar") : t("sweep_admin_b.calendars.new_official_calendar_title")}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder={t("sweep_admin_b.calendars.official_name_placeholder")}
              className="rounded-2xl border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
            />
            <input
              value={editing.season}
              onChange={(e) => setEditing({ ...editing, season: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              placeholder={t("sweep_admin_b.calendars.season_year_placeholder")}
              className="rounded-2xl border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              value={editing.discipline}
              onChange={(e) => setEditing({ ...editing, discipline: e.target.value })}
              placeholder={t("sweep_admin_b.calendars.discipline_placeholder")}
              className="rounded-2xl border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => {
                const events = daysToEvents(editing.dates);
                if (!events.length) {
                  toast.error(t("sweep_admin_b.calendars.select_race_days_first"));
                  return;
                }
                setQuickEvents(events);
              }}
            >
              <ListChecks className="size-3.5" /> {t("sweep_admin_b.calendars.quick_fill")}
            </button>
            <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
              <Upload className="size-3.5" /> {t("sweep_admin_b.calendars.import_ics")}
            </button>
          </div>
          <div className="mt-4">
            <AvailabilityCalendar
              selected={editing.dates.map((d) => dateOf(d))}
              onSelect={(dates) => setEditing({ ...editing, dates: (dates ?? []).map(isoOf).sort() })}
              legend={t("sweep_admin_b.calendars.legend")}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saveMut.isPending}
              onClick={() => {
                if (!editing.name.trim()) {
                  toast.error(t("sweep_admin_b.calendars.give_official_name"));
                  return;
                }
                const violation = checkCalendarLimits({ dates: editing.dates, events: daysToEvents(editing.dates) });
                if (violation) {
                  toast.error(limitMessage(violation));
                  return;
                }
                saveMut.mutate({
                  id: editing.id,
                  name: editing.name.trim(),
                  discipline: editing.discipline.trim() || null,
                  season_year: editing.season ? Number(editing.season) : null,
                  dates: editing.dates,
                  source: editing.source,
                });
              }}
              className="rounded-2xl bg-racing-red px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-40"
            >
              {t("sweep_admin_b.calendars.publish_calendar", { count: editing.dates.length })}
            </button>
            <button type="button" className={btn} onClick={() => setEditing(null)}>
              {t("sweep_admin_b.calendars.cancel")}
            </button>
          </div>
        </div>
      )}

      <Section title={t("sweep_admin_b.calendars.submissions_title")} subtitle={t("sweep_admin_b.calendars.submissions_subtitle")}>
        {isLoading && <p className="text-sm text-muted-foreground">{t("sweep_admin_b.common.loading")}</p>}
        {!isLoading && pending.length === 0 && <p className="text-sm text-muted-foreground">{t("sweep_admin_b.calendars.no_pending")}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {pending.map((c) => (
            <SubmissionCard
              key={c.id}
              c={c}
              onApprove={(name) => approveMut.mutate({ id: c.id, name })}
              onReject={(note) => rejectMut.mutate({ id: c.id, note })}
              onEdit={() => startEdit(c)}
            />
          ))}
        </div>
      </Section>

      <Section title={t("sweep_admin_b.calendars.official_title")} subtitle={t("sweep_admin_b.calendars.official_subtitle")}>
        {official.length === 0 && <p className="text-sm text-muted-foreground">{t("sweep_admin_b.calendars.no_official_yet")}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {official.map((c) => (
            <div key={c.id} className="card-surface rounded-2xl p-4">
              <div className="text-sm font-bold uppercase">{c.name}</div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                {t("sweep_admin_b.calendars.calendar_summary", { days: c.dates.length, events: c.events.length, season: c.season_year ?? "—", owner: c.owner_name })}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={btn} onClick={() => startEdit(c)}>
                  <Pencil className="size-3.5" /> {t("sweep_admin_b.calendars.edit")}
                </button>
                <button
                  type="button"
                  className={btn}
                  onClick={() =>
                    downloadFile(
                      `${c.name.replace(/[^a-z0-9\-_]+/gi, "_")}.ics`,
                      buildIcsFromEvents(c.name, c.events.length ? c.events : daysToEvents(c.dates)),
                      "text/calendar;charset=utf-8",
                    )
                  }
                >
                  <Download className="size-3.5" /> {t("sweep_admin_b.calendars.export_ics")}
                </button>
                <button type="button" className={btn} onClick={async () => {
                    const approved = c.review_status === "approved";
                    const ok = await confirmDialog(
                      t(approved ? "sweep_admin_b.calendars.delete_confirm_body_approved" : "sweep_admin_b.calendars.delete_confirm_body", { name: c.name }),
                      {
                        title: t(approved ? "sweep_admin_b.calendars.delete_confirm_title_approved" : "sweep_admin_b.calendars.delete_confirm_title"),
                        confirmLabel: t("sweep_admin_b.calendars.delete"),
                        destructive: true,
                      },
                    );
                    if (ok) delMut.mutate(c.id);
                  }}>
                  <Trash2 className="size-3.5" /> {t("sweep_admin_b.calendars.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {rejected.length > 0 && (
        <Section title={t("sweep_admin_b.calendars.rejected_title")} subtitle={t("sweep_admin_b.calendars.rejected_subtitle")}>
          <div className="grid gap-4 md:grid-cols-2">
            {rejected.map((c) => (
              <div key={c.id} className="card-surface rounded-2xl p-4">
                <div className="text-sm font-bold uppercase">{c.name}</div>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  {t("sweep_admin_b.calendars.days_by_owner", { days: c.dates.length, owner: c.owner_name })}
                </div>
                {c.review_note && <p className="mt-2 text-sm text-muted-foreground">{t("sweep_admin_b.calendars.reason", { reason: c.review_note })}</p>}
                <div className="mt-3">
                  <button type="button" className={btn} onClick={() => approveMut.mutate({ id: c.id })}>
                    <Check className="size-3.5" /> {t("sweep_admin_b.calendars.approve_anyway")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {quickEvents && (
        <CalendarQuickFillDialog
          open={!!quickEvents}
          onOpenChange={(v) => !v && setQuickEvents(null)}
          events={quickEvents}
          onApply={(dates) =>
            setEditing((prev) =>
              prev
                ? { ...prev, dates }
                : { name: "", discipline: "", season: "", dates, source: "ics" },
            )
          }
        />
      )}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-black uppercase italic tracking-tighter">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function SubmissionCard({
  c,
  onApprove,
  onReject,
  onEdit,
}: {
  c: AdminCalendar;
  onApprove: (name: string) => void;
  onReject: (note: string) => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(c.name);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const events = c.events.length ? c.events : daysToEvents(c.dates);
  return (
    <div className="card-surface rounded-2xl p-4">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
        {t("sweep_admin_b.calendars.submitted_by", { owner: c.owner_name, days: c.dates.length, rounds: events.length })}
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm font-bold"
        placeholder={t("sweep_admin_b.calendars.official_name_placeholder2")}
      />
      <button type="button" className="mt-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground" onClick={() => setOpen((v) => !v)}>
        {open ? t("sweep_admin_b.calendars.hide_rounds") : t("sweep_admin_b.calendars.review_rounds", { count: events.length })}
      </button>
      {open && (
        <ul className="mt-2 max-h-52 space-y-1 overflow-auto text-sm">
          {events.map((e, i) => (
            <li key={i} className="flex justify-between gap-3 border-b border-border/50 py-1">
              <span>{e.title}</span>
              <span className="text-muted-foreground">
                {e.start} → {e.end} ({rangeDayCount(e.start, e.end)}d)
              </span>
            </li>
          ))}
        </ul>
      )}
      {c.review_note && <p className="mt-2 text-sm text-muted-foreground">{t("sweep_admin_b.calendars.note", { note: c.review_note })}</p>}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("sweep_admin_b.calendars.rejection_reason_placeholder")}
        className="mt-3 w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl bg-racing-red px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white hover:brightness-110"
          onClick={() => onApprove(name.trim() || c.name)}
        >
          <Check className="size-3.5" /> {t("sweep_admin_b.calendars.approve_publish")}
        </button>
        <button type="button" className={btn} onClick={() => onReject(note.trim())}>
          <X className="size-3.5" /> {t("sweep_admin_b.calendars.reject")}
        </button>
        <button type="button" className={btn} onClick={onEdit}>
          <Pencil className="size-3.5" /> {t("sweep_admin_b.calendars.edit_dates")}
        </button>
      </div>
    </div>
  );
}
