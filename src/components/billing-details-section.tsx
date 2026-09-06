import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getMyBillingDetails, updateMyBillingDetails } from "@/lib/billing.functions";
import { toastError } from "@/lib/errors";
import { useAuth } from "@/hooks/use-auth";

type FormState = {
  subject_type: "individual" | "company";
  billing_name: string;
  country: string;
  address: string;
  city: string;
  postal_code: string;
  region: string;
  tax_id: string;
  sdi_code: string;
  pec: string;
  billing_email: string;
  billing_phone: string;
};

const EMPTY: FormState = {
  subject_type: "individual",
  billing_name: "",
  country: "",
  address: "",
  city: "",
  postal_code: "",
  region: "",
  tax_id: "",
  sdi_code: "",
  pec: "",
  billing_email: "",
  billing_phone: "",
};

/**
 * Administrative billing registry — deliberately optional and separate from the
 * operational profile. No fiscal logic is implemented here (see DEFERRED
 * Billing & Tax Architecture).
 */
export function BillingDetailsSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const load = useServerFn(getMyBillingDetails);
  const save = useServerFn(updateMyBillingDetails);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data, isLoading } = useQuery({
    queryKey: ["billing-details", user?.id],
    enabled: !!user?.id && open,
    queryFn: () => load(),
  });

  useEffect(() => {
    if (editing) return;
    setForm({
      subject_type: ((data as any)?.subject_type as FormState["subject_type"]) ?? "individual",
      billing_name: (data as any)?.billing_name ?? "",
      country: (data as any)?.country ?? "",
      address: (data as any)?.address ?? "",
      city: (data as any)?.city ?? "",
      postal_code: (data as any)?.postal_code ?? "",
      region: (data as any)?.region ?? "",
      tax_id: (data as any)?.tax_id ?? "",
      sdi_code: (data as any)?.sdi_code ?? "",
      pec: (data as any)?.pec ?? "",
      billing_email: (data as any)?.billing_email ?? "",
      billing_phone: (data as any)?.billing_phone ?? "",
    });
  }, [data, editing]);

  const mutation = useMutation({
    mutationFn: async () => {
      const email = form.billing_email.trim();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(t("billing.invalid_email"));
      const pec = form.pec.trim();
      if (pec && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pec)) throw new Error(t("billing.invalid_pec"));
      return save({ data: form });
    },
    onSuccess: (saved) => {
      qc.setQueryData(["billing-details", user?.id], saved);
      toast.success(t("billing.saved"));
      setEditing(false);
    },
    onError: (e) => toastError(e, "sweep_profile.common.failed"),
  });

  const isCompany = form.subject_type === "company";
  const isItaly = /^(it|ital)/i.test(form.country.trim());

  return (
    <div className="min-w-0 border border-border bg-card p-4 sm:p-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="font-mono text-xs uppercase tracking-widest text-racing-red">{t("billing.section_title")}</span>
        <span className="font-mono text-xs text-muted-foreground">{open ? "−" : "+"}</span>
      </button>
      <p className="mt-2 text-[11px] text-muted-foreground">{t("billing.section_hint")}</p>

      {open && (
        <div className="mt-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">{t("sweep_profile.profile.loading")}</div>
          ) : editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">{t("billing.subject_type")}</label>
                <select
                  value={form.subject_type}
                  onChange={(e) => setForm({ ...form, subject_type: e.target.value as FormState["subject_type"] })}
                  className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="individual">{t("billing.subject_individual")}</option>
                  <option value="company">{t("billing.subject_company")}</option>
                </select>
              </div>
              <Field label={isCompany ? t("billing.company_name") : t("billing.person_name")} value={form.billing_name} onChange={(v) => setForm({ ...form, billing_name: v })} />
              <Field label={t("billing.country")} value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
              <Field label={t("billing.address")} value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("billing.city")} value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
                <Field label={t("billing.postal_code")} value={form.postal_code} onChange={(v) => setForm({ ...form, postal_code: v })} />
              </div>
              <Field label={t("billing.region")} value={form.region} onChange={(v) => setForm({ ...form, region: v })} />
              <Field label={t("billing.tax_id")} value={form.tax_id} onChange={(v) => setForm({ ...form, tax_id: v })} mono />
              {(isItaly || form.sdi_code || form.pec) && (
                <div className="border border-border/60 p-3">
                  <div className="label-mono text-[10px] text-muted-foreground">{t("billing.italy_block")}</div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{t("billing.italy_hint")}</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <Field label={t("billing.sdi_code")} value={form.sdi_code} onChange={(v) => setForm({ ...form, sdi_code: v })} mono />
                    <Field label={t("billing.pec")} value={form.pec} onChange={(v) => setForm({ ...form, pec: v })} />
                  </div>
                </div>
              )}
              <Field label={t("billing.billing_email")} value={form.billing_email} onChange={(v) => setForm({ ...form, billing_email: v })} />
              <Field label={t("billing.billing_phone")} value={form.billing_phone} onChange={(v) => setForm({ ...form, billing_phone: v })} />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending}
                  className="bg-racing-red px-4 py-2 text-xs font-bold uppercase text-white"
                >
                  {t("sweep_profile.common.save")}
                </button>
                <button onClick={() => setEditing(false)} className="border border-border px-4 py-2 text-xs font-bold uppercase">
                  {t("sweep_profile.common.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <ReadRow label={t("billing.subject_type")} value={form.subject_type === "company" ? t("billing.subject_company") : t("billing.subject_individual")} />
              <ReadRow label={isCompany ? t("billing.company_name") : t("billing.person_name")} value={form.billing_name} />
              <ReadRow label={t("billing.country")} value={form.country} />
              <ReadRow label={t("billing.address")} value={form.address} />
              <ReadRow label={t("billing.city")} value={form.city} />
              <ReadRow label={t("billing.postal_code")} value={form.postal_code} />
              <ReadRow label={t("billing.region")} value={form.region} />
              <ReadRow label={t("billing.tax_id")} value={form.tax_id} mono />
              <ReadRow label={t("billing.sdi_code")} value={form.sdi_code} mono />
              <ReadRow label={t("billing.pec")} value={form.pec} />
              <ReadRow label={t("billing.billing_email")} value={form.billing_email} />
              <ReadRow label={t("billing.billing_phone")} value={form.billing_phone} />
              <button onClick={() => setEditing(true)} className="mt-2 text-xs text-racing-red hover:underline">
                {t("billing.edit")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, mono }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full min-w-0 border border-border bg-background px-3 py-2 text-sm ${mono ? "font-mono uppercase" : ""}`}
      />
    </div>
  );
}

function ReadRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <span className={`ml-2 break-words ${mono ? "font-mono" : ""}`}>{value?.trim() ? value : "—"}</span>
    </div>
  );
}
