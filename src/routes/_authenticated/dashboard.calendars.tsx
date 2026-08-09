import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, Trash2, Send, Download, ListChecks } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BackButton } from "@/components/back-button";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { CalendarQuickFillDialog } from "@/components/calendar-quick-fill";
import { deleteCalendar, listMyCalendars, saveCalendar, submitCalendarForReview, type UserCalendar } from "@/lib/calendars.functions";
import { buildIcsFromEvents, daysToEvents, dateOf, isoOf, parseIcs, type CalendarEventItem } from "@/lib/ics";
import { downloadFile } from "@/lib/calendar-contacts";

export const Route = createFileRoute("/_authenticated/dashboard/calendars")({
  component: ManageCalendarsPage,
  head: () => ({
    meta: [
      { title: i18n.t("sweep_public.dashboard_calendars.meta_title") },
      { name: "description", content: i18n.t("sweep_public.dashboard_calendars.meta_description") },
      { property: "og:title", content: i18n.t("sweep_public.dashboard_calendars.meta_title") },
      { property: "og:description", content: i18n.t("sweep_public.dashboard_calendars.meta_og_description") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const btn =
  "inline-flex items-center gap-2 border border-border bg-background px-3 py-2 font-mono text-[10px] uppercase tracking-widest hover:border-racing-red hover:text-racing-red transition-colors";

function ManageCalendarsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useServerFn(listMyCalendars);
  const save = useServerFn(saveCalendar);
  const remove = useServerFn(deleteCalendar);
  const submit = useServerFn(submitCalendarForReview);
  const fileRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState<{ id?: string; name: string; dates: string[] } | null>(null);
  const [quickEvents, setQuickEvents] = useState<CalendarEventItem[] | null>(null);

  const { data } = useQuery({ queryKey: ["my-calendars"], queryFn: () => list() });
  const mine: UserCalendar[] = data?.mine ?? [];
  const shared: UserCalendar[] = data?.shared ?? [];

  const saveMut = useMutation({
    mutationFn: (payload: { id?: string; name: string; dates: string[]; source: "manual" | "ics" }) =>
      save({ data: { ...payload, events: daysToEvents(payload.dates) } }),
    onSuccess: () => {
      toast.success(t("sweep_public.dashboard_calendars.toast.calendar_saved"));
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["my-calendars"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_public.dashboard_calendars.toast.save_failed")),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success(t("sweep_public.dashboard_calendars.toast.calendar_deleted"));
      qc.invalidateQueries({ queryKey: ["my-calendars"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_public.dashboard_calendars.toast.delete_failed")),
  });

  const submitMut = useMutation({
    mutationFn: (id: string) => submit({ data: { id } }),
    onSuccess: () => {
      toast.success(t("sweep_public.dashboard_calendars.toast.submitted_for_review"));
      qc.invalidateQueries({ queryKey: ["my-calendars"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("sweep_public.dashboard_calendars.toast.submit_failed")),
  });

  const importIcs = async (file: File) => {
    try {
      const events = parseIcs(await file.text());
      if (!events.length) {
        toast.error(t("sweep_public.dashboard_calendars.toast.no_events_in_ics"));
        return;
      }
      setEditing({ name: file.name.replace(/\.ics$/i, ""), dates: [] });
      setQuickEvents(events);
    } catch {
      toast.error(t("sweep_public.dashboard_calendars.toast.could_not_read_ics"));
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page pt-6">
        <BackButton />
      </div>
      <div className="container-page py-12">
        <div className="label-mono">[MANAGE CALENDARS]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("sweep_public.dashboard_calendars.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {t("sweep_public.dashboard_calendars.description")}
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => setEditing({ name: "", dates: [] })}>
            <ListChecks className="size-3.5" /> {t("sweep_public.dashboard_calendars.new_calendar")}
          </button>
          <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
            <Upload className="size-3.5" /> {t("sweep_public.dashboard_calendars.import_ics")}
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
          <div className="mt-6 border border-border bg-card p-6">
            <div className="label-mono">[{editing.id ? t("sweep_public.dashboard_calendars.edit_calendar_bracket") : t("sweep_public.dashboard_calendars.new_calendar_bracket")}]</div>
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder={t("sweep_public.dashboard_calendars.calendar_name_placeholder")}
              className="mt-2 w-full max-w-md border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={btn}
                onClick={() => {
                  const events = daysToEvents(editing.dates);
                  if (!events.length) {
                    toast.error(t("sweep_public.dashboard_calendars.quick_fill_error"));
                    return;
                  }
                  setQuickEvents(events);
                }}
              >
                <ListChecks className="size-3.5" /> {t("sweep_public.dashboard_calendars.quick_fill_button")}
              </button>
              <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
                <Upload className="size-3.5" /> {t("sweep_public.dashboard_calendars.import_ics")}
              </button>
            </div>
            <div className="mt-4">
              <AvailabilityCalendar
                selected={editing.dates.map((d) => dateOf(d))}
                onSelect={(dates) => setEditing({ ...editing, dates: (dates ?? []).map(isoOf).sort() })}
                legend={t("sweep_public.dashboard_calendars.calendar_legend")}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!editing.name.trim()) {
                    toast.error(t("sweep_public.dashboard_calendars.toast.give_calendar_name"));
                    return;
                  }
                  saveMut.mutate({ id: editing.id, name: editing.name.trim(), dates: editing.dates, source: "manual" });
                }}
                disabled={saveMut.isPending}
                className="bg-racing-red px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-40"
              >
                {t("sweep_public.dashboard_calendars.save_calendar_button", { count: editing.dates.length })}
              </button>
              <button type="button" className={btn} onClick={() => setEditing(null)}>
                {t("sweep_public.dashboard_calendars.cancel")}
              </button>
            </div>
          </div>
        )}

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {mine.map((c) => (
            <div key={c.id} className="border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold uppercase">{c.name}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t("sweep_public.dashboard_calendars.days_events_source", { days: c.dates.length, events: c.events.length, source: c.source })}
                  </div>
                </div>
                <span
                  className={`font-mono text-[9px] uppercase tracking-widest ${
                    c.review_status === "approved"
                      ? "text-[#16a34a]"
                      : c.review_status === "pending"
                        ? "text-racing-yellow"
                        : c.review_status === "rejected"
                          ? "text-racing-red"
                          : "text-muted-foreground"
                  }`}
                >
                  {c.review_status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={btn} onClick={() => setEditing({ id: c.id, name: c.name, dates: c.dates })}>
                  {t("sweep_public.dashboard_calendars.edit")}
                </button>
                <button
                  type="button"
                  className={btn}
                  onClick={() => downloadFile(`${c.name.replace(/[^a-z0-9\-_]+/gi, "_")}.ics`, buildIcsFromEvents(c.name, c.events.length ? c.events : daysToEvents(c.dates)), "text/calendar;charset=utf-8")}
                >
                  <Download className="size-3.5" /> {t("sweep_public.dashboard_calendars.export_ics")}
                </button>
                {(c.review_status === "private" || c.review_status === "rejected") && (
                  <button type="button" className={btn} onClick={() => submitMut.mutate(c.id)}>
                    <Send className="size-3.5" /> {t("sweep_public.dashboard_calendars.submit_review")}
                  </button>
                )}
                <button type="button" className={btn} onClick={() => delMut.mutate(c.id)}>
                  <Trash2 className="size-3.5" /> {t("sweep_public.dashboard_calendars.delete")}
                </button>
              </div>
            </div>
          ))}
          {mine.length === 0 && !editing && (
            <p className="text-sm text-muted-foreground">{t("sweep_public.dashboard_calendars.no_calendars")}</p>
          )}
        </div>

        {shared.length > 0 && (
          <div className="mt-12">
            <div className="label-mono">{t("sweep_public.dashboard_calendars.platform_calendars")}</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {shared.map((c) => (
                <div key={c.id} className="border border-border bg-card p-4">
                  <div className="text-sm font-bold uppercase">{c.name}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t("sweep_public.dashboard_calendars.days_approved", { days: c.dates.length })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={btn}
                      onClick={() => setEditing({ name: `${c.name} (copy)`, dates: c.dates })}
                    >
                      {t("sweep_public.dashboard_calendars.copy_to_archive")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {quickEvents && (
        <CalendarQuickFillDialog
          open={!!quickEvents}
          onOpenChange={(v) => !v && setQuickEvents(null)}
          events={quickEvents}
          onApply={(dates) => setEditing((prev) => ({ id: prev?.id, name: prev?.name ?? "", dates }))}
        />
      )}

      <SiteFooter />
    </div>
  );
}
