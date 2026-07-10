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
import { setAvailability, getMyAvailability } from "@/lib/paddock.functions";

export const Route = createFileRoute("/_authenticated/dashboard/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("user_type").eq("id", user!.id).maybeSingle()).data,
  });

  const getAvail = useServerFn(getMyAvailability);
  const setAvail = useServerFn(setAvailability);
  const createReq = useServerFn(createRequest);

  const { data: myDays = [] } = useQuery({
    queryKey: ["my-availability", user?.id],
    enabled: !!user && profile?.user_type === "freelancer",
    queryFn: () => getAvail(),
  });

  const selectedDates = myDays.map((d: string) => new Date(d + "T00:00:00"));

  const mutation = useMutation({
    mutationFn: async (dates: Date[] | undefined) => {
      const next = dates ?? [];
      const currentSet = new Set(myDays);
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const nextSet = new Set(next.map(fmt));
      const toAdd = [...nextSet].filter((d) => !currentSet.has(d));
      const toRemove = [...currentSet].filter((d) => !nextSet.has(d));
      if (toAdd.length) await setAvail({ data: { dates: toAdd, add: true } });
      if (toRemove.length) await setAvail({ data: { dates: toRemove, add: false } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-availability"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        {profile?.user_type === "team" ? (
          <TeamRequestForm createReq={createReq} />
        ) : (
          <>
            <div className="label-mono">[CALENDAR]</div>
            <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("calendar.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("calendar.instructions_freelancer")}</p>
            <p className="mt-1 font-mono text-xs text-racing-red">{t("calendar.available_days", { count: myDays.length })}</p>
            <div className="mt-6">
              <AvailabilityCalendar selected={selectedDates} onSelect={(d) => mutation.mutate(d)} min={new Date()} />
            </div>
          </>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}

function TeamRequestForm({ createReq }: { createReq: ReturnType<typeof useServerFn<typeof createRequest>> }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    role: "mechanic" as FreelancerRole,
    discipline: "f1" as Discipline,
    duration: "race_weekend" as DurationType,
    circuit: "",
    location: "",
    start_date: "",
    end_date: "",
    budget_min: "",
    budget_max: "",
    budget_unit: "day" as "day" | "event" | "season",
    notes: "",
  });

  const mut = useMutation({
    mutationFn: () => createReq({ data: {
      title: form.title,
      role: form.role,
      discipline: form.discipline,
      duration: form.duration,
      circuit: form.circuit || null,
      location: form.location || null,
      start_date: form.start_date,
      end_date: form.end_date,
      budget_min: form.budget_min ? parseInt(form.budget_min) : null,
      budget_max: form.budget_max ? parseInt(form.budget_max) : null,
      budget_unit: form.budget_unit,
      notes: form.notes || null,
    } }),
    onSuccess: () => { toast.success("Request posted. Matches recomputed."); qc.invalidateQueries(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <div className="label-mono">[REQUEST CALENDAR]</div>
      <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("calendar.team_title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("calendar.instructions_team")}</p>

      <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="mt-8 grid gap-4 border border-border bg-card p-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="label-mono">Title</label>
          <input required minLength={3} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2" />
        </div>
        <SelectField label={t("jobs.filters.role")} value={form.role} onChange={(v) => setForm({ ...form, role: v as FreelancerRole })} options={ROLES.map((r) => [r, t(`role.${r}`)])} />
        <SelectField label={t("jobs.filters.discipline")} value={form.discipline} onChange={(v) => setForm({ ...form, discipline: v as Discipline })} options={DISCIPLINES.map((r) => [r, t(`discipline.${r}`)])} />
        <SelectField label={t("jobs.filters.duration")} value={form.duration} onChange={(v) => setForm({ ...form, duration: v as DurationType })} options={DURATIONS.map((r) => [r, t(`duration.${r}`)])} />
        <div>
          <label className="label-mono">Circuit</label>
          <input value={form.circuit} onChange={(e) => setForm({ ...form, circuit: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2" />
        </div>
        <div>
          <label className="label-mono">Start date</label>
          <input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2" />
        </div>
        <div>
          <label className="label-mono">End date</label>
          <input type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2" />
        </div>
        <div>
          <label className="label-mono">Budget min (€)</label>
          <input type="number" min="0" value={form.budget_min} onChange={(e) => setForm({ ...form, budget_min: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2" />
        </div>
        <div>
          <label className="label-mono">Budget max (€)</label>
          <input type="number" min="0" value={form.budget_max} onChange={(e) => setForm({ ...form, budget_max: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2" />
        </div>
        <div className="md:col-span-2">
          <label className="label-mono">Notes</label>
          <textarea maxLength={1000} rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 w-full border border-border bg-background px-3 py-2" />
        </div>
        <button type="submit" disabled={mut.isPending} className="md:col-span-2 bg-racing-red py-3 text-sm font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60">
          {t("jobs.post_request")}
        </button>
      </form>
    </>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <label className="label-mono">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full border border-border bg-background px-3 py-2">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
