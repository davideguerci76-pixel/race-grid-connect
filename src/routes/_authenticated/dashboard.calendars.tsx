import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
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
      { title: "Manage calendars — Pit Call" },
      { name: "description", content: "Create, import and share championship calendars to use in your Pit Calls and availability." },
      { property: "og:title", content: "Manage calendars — Pit Call" },
      { property: "og:description", content: "Build custom motorsport calendars, import .ics files and reuse them anywhere on Pit Call." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const btn =
  "inline-flex items-center gap-2 border border-border bg-background px-3 py-2 font-mono text-[10px] uppercase tracking-widest hover:border-racing-red hover:text-racing-red transition-colors";

function ManageCalendarsPage() {
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
      toast.success("Calendar saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["my-calendars"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Calendar deleted");
      qc.invalidateQueries({ queryKey: ["my-calendars"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const submitMut = useMutation({
    mutationFn: (id: string) => submit({ data: { id } }),
    onSuccess: () => {
      toast.success("Sent to the platform for review. You'll be rewarded in tokens if it gets approved.");
      qc.invalidateQueries({ queryKey: ["my-calendars"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Submit failed"),
  });

  const importIcs = async (file: File) => {
    try {
      const events = parseIcs(await file.text());
      if (!events.length) {
        toast.error("No events found in this .ics file");
        return;
      }
      setEditing({ name: file.name.replace(/\.ics$/i, ""), dates: [] });
      setQuickEvents(events);
    } catch {
      toast.error("Could not read the .ics file");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6">
        <BackButton />
      </div>
      <div className="container-page py-12">
        <div className="label-mono">[MANAGE CALENDARS]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">My calendars</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Build your own championship calendars, import an existing <span className="font-bold">.ics</span> file, and reuse them instantly for your Pit Calls
          or your availability — even if they are not part of the official platform database.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => setEditing({ name: "", dates: [] })}>
            <ListChecks className="size-3.5" /> New calendar
          </button>
          <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
            <Upload className="size-3.5" /> Import .ics file
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
            <div className="label-mono">[{editing.id ? "EDIT" : "NEW"} CALENDAR]</div>
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Calendar name (e.g. F4 Italian 2027)"
              className="mt-2 w-full max-w-md border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={btn}
                onClick={() => {
                  const events = daysToEvents(editing.dates);
                  if (!events.length) {
                    toast.error("Select the race days first, then apply the logistics rule");
                    return;
                  }
                  setQuickEvents(events);
                }}
              >
                <ListChecks className="size-3.5" /> Quick fill (Mon → Mon rule)
              </button>
              <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
                <Upload className="size-3.5" /> Import .ics file
              </button>
            </div>
            <div className="mt-4">
              <AvailabilityCalendar
                selected={editing.dates.map((d) => dateOf(d))}
                onSelect={(dates) => setEditing({ ...editing, dates: (dates ?? []).map(isoOf).sort() })}
                legend="Selected (green) days = working days of this calendar."
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!editing.name.trim()) {
                    toast.error("Give your calendar a name");
                    return;
                  }
                  saveMut.mutate({ id: editing.id, name: editing.name.trim(), dates: editing.dates, source: "manual" });
                }}
                disabled={saveMut.isPending}
                className="bg-racing-red px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-40"
              >
                Save calendar ({editing.dates.length} days)
              </button>
              <button type="button" className={btn} onClick={() => setEditing(null)}>
                Cancel
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
                    {c.dates.length} days · {c.events.length} events · {c.source}
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
                  Edit
                </button>
                <button
                  type="button"
                  className={btn}
                  onClick={() => downloadFile(`${c.name.replace(/[^a-z0-9\-_]+/gi, "_")}.ics`, buildIcsFromEvents(c.name, c.events.length ? c.events : daysToEvents(c.dates)), "text/calendar;charset=utf-8")}
                >
                  <Download className="size-3.5" /> Export .ics
                </button>
                {(c.review_status === "private" || c.review_status === "rejected") && (
                  <button type="button" className={btn} onClick={() => submitMut.mutate(c.id)}>
                    <Send className="size-3.5" /> Submit for review
                  </button>
                )}
                <button type="button" className={btn} onClick={() => delMut.mutate(c.id)}>
                  <Trash2 className="size-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
          {mine.length === 0 && !editing && (
            <p className="text-sm text-muted-foreground">No calendars yet — create one from scratch or import an .ics file.</p>
          )}
        </div>

        {shared.length > 0 && (
          <div className="mt-12">
            <div className="label-mono">[PLATFORM CALENDARS]</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {shared.map((c) => (
                <div key={c.id} className="border border-border bg-card p-4">
                  <div className="text-sm font-bold uppercase">{c.name}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {c.dates.length} days · approved
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={btn}
                      onClick={() => setEditing({ name: `${c.name} (copy)`, dates: c.dates })}
                    >
                      Copy to my archive
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
