import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Pit Call" },
      { name: "description", content: "Request a secure password reset link for your Pit Call account." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("reset_pw.request_failed", { defaultValue: "Could not send the reset email. Try again." }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page flex justify-center py-16">
        <div className="w-full max-w-md border border-border bg-card p-8">
          <div className="label-mono mb-4">{t("reset_pw.tag", { defaultValue: "[PASSWORD RESET]" })}</div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter">
            {t("reset_pw.forgot_title", { defaultValue: "Forgot your password?" })}
          </h1>
          {sent ? (
            <div className="mt-6 border border-border bg-background p-4">
              <p className="text-sm text-foreground">
                {t("reset_pw.sent_title", { defaultValue: "Reset link sent." })}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("reset_pw.sent_desc", { defaultValue: "If an account exists for that address, you'll receive an email with a secure, time-limited link to set a new password. Check your spam folder too." })}
              </p>
            </div>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                {t("reset_pw.forgot_desc", { defaultValue: "Enter your account email. We'll send you a secure, time-limited link to set a new password." })}
              </p>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="label-mono">{t("auth.email")}</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("common.email_placeholder")}
                    className="mt-2 w-full border border-border bg-background px-4 py-3 focus:border-racing-red focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-racing-red py-3 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:brightness-110 disabled:opacity-60"
                >
                  {t("reset_pw.send_link", { defaultValue: "Send reset link" })}
                </button>
              </form>
            </>
          )}
          <div className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/auth" search={{ mode: "signin", type: "freelancer" }} className="font-bold text-racing-red">
              {t("reset_pw.back_to_signin", { defaultValue: "Back to sign in" })}
            </Link>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
