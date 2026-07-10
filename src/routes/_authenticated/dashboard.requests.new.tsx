import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { createRequest, getMyRequests } from "@/lib/paddock.functions";
import { DISCIPLINES, DURATIONS, ROLES, type Discipline, type DurationType, type FreelancerRole } from "@/lib/paddock";

const search = z.object({ from: fallback(z.string().optional(), undefined) });

export const Route = createFileRoute("/_authenticated/dashboard/requests/new")({
  validateSearch: zodValidator(search),
  component: NewRequestPage,
});

const COST = 5;

function NewRequestPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { from } = Route.useSearch();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: p }, { data: balance }] = await Promise.all([
        supabase.from("profiles").select("user_type").eq("id", user!.id).maybeSingle(),
        supabase.rpc("my_token_balance"),
      ]);
      return { user_type: p?.user_type, token_balance: (balance as number | null) ?? 0 };
    },
  });

  useEffect(() => {
    if (profile && profile.user_type !== "team") navigate({ to: "/dashboard/calendar" });
  }, [profile, navigate]);

  const list = useServerFn(getMyRequests);
  const create = useServerFn(createRequest);

  // Pre-fill from a previous request when ?from=<uuid>
  const { data: existing } = useQuery({
    queryKey: ["my-requests", user?.id],
    enabled: !!user && !!from,
    queryFn: () => list(),
  });
  const source = from ? existing?.find((r) => r.id === from) : null;

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

  useEffect(() => {
    if (!source) return;
    setForm({
      title: source.title,
      role: source.role as FreelancerRole,
      discipline: source.discipline as Discipline,
      duration: source.duration as DurationType,
      circuit: source.circuit ?? "",
      location: source.location ?? "",
      start_date: "",
      end_date: "",
      budget_min: source.budget_min ? String(source.budget_min) : "",
      budget_max: source.budget_max ? String(source.budget_max) : "",
      budget_unit: (source.budget_unit as "day" | "event" | "season") ?? "day",
      notes: source.notes ?? "",
    });
  }, [source]);

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
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
        },
      }),
    onSuccess: () => {
      toast.success(t("requests.posted"));
      qc.invalidateQueries();
      navigate({ to: "/dashboard/requests" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const balance = profile?.token_balance ?? 0;
  const canAfford = balance >= COST;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="label-mono">[NEW REQUEST]</div>
            <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("requests.new")}</h1>
          </div>
          <Link to="/dashboard/requests" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-racing-red">
            ← {t("requests.back")}
          </Link>
        </div>

        <div className="mt-4 flex items-center gap-3 border border-border bg-card p-4 text-sm">
          <span className="font-mono text-xs uppercase text-muted-foreground">{t("requests.cost")}:</span>
          <span className="font-bold text-racing-red">{COST} tokens</span>
          <span className="ml-auto font-mono text-xs uppercase text-muted-foreground">{t("requests.balance")}:</span>
          <span className={`font-bold ${canAfford ? "text-foreground" : "text-racing-red"}`}>{balance}</span>
          {!canAfford && (
            <Link to="/dashboard/tokens" className="ml-3 border border-racing-red px-3 py-1 text-[11px] font-bold uppercase text-racing-red hover:bg-racing-red/10">
              {t("requests.top_up")}
            </Link>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canAfford) {
              toast.error(t("requests.insufficient"));
              return;
            }
            mut.mutate();
          }}
          className="mt-6 grid gap-4 border border-border bg-card p-6 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label className="label-mono">Title</label>
            <input
              required
              minLength={3}
              maxLength={120}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. GT3 mechanic – Spa 6h"
              className="mt-1 w-full border border-border bg-background px-3 py-2"
            />
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
          <button
            type="submit"
            disabled={mut.isPending || !canAfford}
            className="md:col-span-2 bg-racing-red py-3 text-sm font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
          >
            {mut.isPending ? "…" : `${t("requests.post_for")} ${COST} tokens`}
          </button>
        </form>
      </div>
      <SiteFooter />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <label className="label-mono">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full border border-border bg-background px-3 py-2">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
