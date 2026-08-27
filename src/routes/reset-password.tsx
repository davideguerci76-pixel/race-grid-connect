import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set new password — Pit Call" },
      { name: "description", content: "Set a new password for your Pit Call account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState<boolean | null>(null);

  useEffect(() => {
    // The reset email link carries a recovery token in the URL hash; the
    // Supabase client exchanges it for a session and fires PASSWORD_RECOVERY.
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("access_token")) {
      setRecoveryReady(true);
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryReady(true);
    });
    // If nothing recovery-related arrives, the link is missing/expired.
    const timeout = window.setTimeout(() => {
      setRecoveryReady((ready) => (ready === null ? false : ready));
    }, 5000);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error(t("reset_pw.mismatch", { defaultValue: "Passwords do not match." }));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success(t("reset_pw.updated", { defaultValue: "Password updated. You're signed in." }));
      navigate({ to: "/dashboard" });
    } catch (err) {
      toastError(err, "reset_pw.update_failed");
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
            {t("reset_pw.new_title", { defaultValue: "Set a new password" })}
          </h1>

          {recoveryReady === false ? (
            <div className="mt-6 border border-border bg-background p-4">
              <p className="text-sm text-foreground">
                {t("reset_pw.expired_title", { defaultValue: "This reset link is invalid or expired." })}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("reset_pw.expired_desc", { defaultValue: "Reset links are time-limited and single-use. Request a fresh one." })}
              </p>
              <div className="mt-4">
                <Link to="/forgot-password" className="inline-block bg-racing-red px-5 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110">
                  {t("reset_pw.request_new", { defaultValue: "Request new link" })}
                </Link>
              </div>
            </div>
          ) : recoveryReady === null ? (
            <p className="mt-6 text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Loading…" })}</p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="label-mono">{t("reset_pw.new_password", { defaultValue: "New password" })}</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 w-full border border-border bg-background px-4 py-3 focus:border-racing-red focus:outline-none"
                />
              </div>
              <div>
                <label className="label-mono">{t("reset_pw.confirm_password", { defaultValue: "Confirm new password" })}</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-2 w-full border border-border bg-background px-4 py-3 focus:border-racing-red focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-racing-red py-3 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:brightness-110 disabled:opacity-60"
              >
                {t("reset_pw.update_password", { defaultValue: "Update password" })}
              </button>
            </form>
          )}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
