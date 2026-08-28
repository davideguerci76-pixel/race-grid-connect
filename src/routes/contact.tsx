import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { sendContactMessage, type ContactFormInput } from "@/lib/contact.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Pitcall — Motorsport Matching Platform" },
      {
        name: "description",
        content:
          "Get in touch with PITCALL. Questions, feedback, account issues or partnership requests for the motorsport matching platform.",
      },
      { property: "og:title", content: "Contact Pitcall — Motorsport Matching Platform" },
      {
        property: "og:description",
        content:
          "Get in touch with PITCALL. Questions, feedback, account issues or partnership requests for the motorsport matching platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContactPage,
});

const CONTACT_REASONS: ContactFormInput["reasons"][number][] = [
  "general_info",
  "technical_issue",
  "account_profile",
  "pitcall_matching",
  "feedback_suggestion",
  "report_problem",
  "partnership_business",
  "other",
];

const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  userType: z.enum(["team", "freelancer"]),
  reasons: z.array(z.enum(CONTACT_REASONS as [string, ...string[]])).min(1),
  subject: z.string().trim().min(2).max(200),
  message: z.string().trim().min(10).max(2000),
});

function ContactPage() {
  const { t } = useTranslation();
  const sendMessage = useServerFn(sendContactMessage);

  const [form, setForm] = useState<ContactFormInput>({
    name: "",
    email: "",
    userType: "team",
    reasons: [],
    subject: "",
    message: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormInput, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof ContactFormInput, boolean>>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function updateField<K extends keyof ContactFormInput>(field: K, value: ContactFormInput[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => ({ ...prev, [field]: true }));
    validateField(field, value);
  }

  function validateField<K extends keyof ContactFormInput>(field: K, value: ContactFormInput[K]) {
    const result = contactSchema.safeParse({ ...form, [field]: value });
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      setErrors((prev) => ({
        ...prev,
        [field]: fieldErrors[field as string]?.[0] ?? undefined,
      }));
    } else {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function validateAll(): boolean {
    const result = contactSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      setErrors(
        Object.fromEntries(
          Object.entries(fieldErrors).map(([k, v]) => [k, v?.[0]]),
        ) as Partial<Record<keyof ContactFormInput, string>>,
      );
      setTouched({
        name: true,
        email: true,
        userType: true,
        reasons: true,
        subject: true,
        message: true,
      });
      return false;
    }
    setErrors({});
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAll()) return;

    setStatus("submitting");
    setErrorMsg("");
    try {
      await sendMessage({ data: form });
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(t("contact.error_generic"));
    }
  }

  function toggleReason(reason: ContactFormInput["reasons"][number]) {
    setForm((prev) => {
      const next = prev.reasons.includes(reason)
        ? prev.reasons.filter((r) => r !== reason)
        : [...prev.reasons, reason];
      const updated = { ...prev, reasons: next };
      validateField("reasons", next);
      return updated;
    });
    setTouched((prev) => ({ ...prev, reasons: true }));
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-black/20 px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-racing-red focus:ring-1 focus:ring-racing-red";
  const labelCls = "block text-xs font-bold uppercase tracking-widest text-muted-foreground";
  const errorCls = "mt-1.5 text-xs font-medium text-racing-red";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="container-page flex-1 py-16 md:py-24">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="text-4xl font-black uppercase italic tracking-tighter md:text-6xl">
            {t("contact.title_a")} <span className="text-racing-red">{t("contact.title_b")}</span>
          </h1>
          <p className="mt-5 text-base text-muted-foreground md:text-lg">
            {t("contact.subtitle_line1")}
            <br />
            {t("contact.subtitle_line2")}
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-xl">
          {status === "success" ? (
            <div className="rounded-xl border border-racing-red/30 bg-racing-red/10 p-8 text-center">
              <h2 className="text-lg font-black uppercase text-foreground">{t("contact.success_title")}</h2>
              <p className="mt-3 text-sm text-muted-foreground">{t("contact.success_desc")}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-border bg-card/40 p-6 md:p-10" noValidate>
              <div>
                <label htmlFor="contact-name" className={labelCls}>
                  {t("contact.name")}
                </label>
                <input
                  id="contact-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  onBlur={() => updateField("name", form.name)}
                  placeholder={t("contact.name_placeholder")}
                  className={cn(inputCls, touched.name && errors.name && "border-racing-red")}
                />
                {touched.name && errors.name && <p className={errorCls}>{t("contact.error_name")}</p>}
              </div>

              <div>
                <label htmlFor="contact-email" className={labelCls}>
                  {t("contact.email")}
                </label>
                <input
                  id="contact-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  onBlur={() => updateField("email", form.email)}
                  placeholder={t("contact.email_placeholder")}
                  className={cn(inputCls, touched.email && errors.email && "border-racing-red")}
                />
                {touched.email && errors.email && <p className={errorCls}>{t("contact.error_email")}</p>}
              </div>

              <div>
                <span className={labelCls}>{t("contact.user_type")}</span>
                <div className="grid grid-cols-2 gap-3">
                  {(["team", "freelancer"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => updateField("userType", type)}
                      className={cn(
                        "rounded-lg border px-4 py-3.5 text-sm font-bold uppercase tracking-widest transition-colors",
                        form.userType === type
                          ? "border-racing-red bg-racing-red/10 text-foreground"
                          : "border-border bg-black/20 text-muted-foreground hover:border-foreground/30",
                      )}
                    >
                      {t(`contact.user_type_${type}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className={labelCls}>{t("contact.reasons")}</span>
                <div className="flex flex-wrap gap-2">
                  {CONTACT_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => toggleReason(reason)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors",
                        form.reasons.includes(reason)
                          ? "border-racing-red bg-racing-red text-white"
                          : "border-border bg-black/20 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                      )}
                    >
                      {t(`contact.reason_${reason}`)}
                    </button>
                  ))}
                </div>
                {touched.reasons && errors.reasons && <p className={errorCls}>{t("contact.error_reasons")}</p>}
              </div>

              <div>
                <label htmlFor="contact-subject" className={labelCls}>
                  {t("contact.subject")}
                </label>
                <input
                  id="contact-subject"
                  type="text"
                  value={form.subject}
                  onChange={(e) => updateField("subject", e.target.value)}
                  onBlur={() => updateField("subject", form.subject)}
                  placeholder={t("contact.subject_placeholder")}
                  className={cn(inputCls, touched.subject && errors.subject && "border-racing-red")}
                />
                {touched.subject && errors.subject && <p className={errorCls}>{t("contact.error_subject")}</p>}
              </div>

              <div>
                <label htmlFor="contact-message" className={labelCls}>
                  {t("contact.message")}
                </label>
                <textarea
                  id="contact-message"
                  value={form.message}
                  onChange={(e) => updateField("message", e.target.value)}
                  onBlur={() => updateField("message", form.message)}
                  placeholder={t("contact.message_placeholder")}
                  rows={5}
                  className={cn(inputCls, "resize-y", touched.message && errors.message && "border-racing-red")}
                />
                {touched.message && errors.message && <p className={errorCls}>{t("contact.error_message")}</p>}
              </div>

              {status === "error" && (
                <div className="rounded-lg border border-racing-red/30 bg-racing-red/10 p-4 text-center text-sm text-foreground">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className="w-full rounded-lg bg-racing-red py-4 text-sm font-black uppercase tracking-widest text-white transition-[filter] hover:brightness-110 disabled:opacity-60"
              >
                {status === "submitting" ? t("contact.sending") : t("contact.send")}
              </button>
            </form>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
