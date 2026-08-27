import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useAuth } from "@/hooks/use-auth";
import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/verify-email")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Verify your email — Pit Call" },
      { name: "description", content: "Confirm your email address to unlock the Pit Call platform." },
      { property: "og:title", content: "Verify your email — Pit Call" },
      { property: "og:description", content: "Confirm your email address to unlock the Pit Call platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", search: { mode: "signin" as const, type: "freelancer" as const } });
      return;
    }
    if (user.email_confirmed_at) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  async function resend() {
    if (!user?.email) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: user.email,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) throw error;
      toast.success(t("verify_email.resent", { defaultValue: "Verification email sent." }));
    } catch (e) {
      toastError(e);
    } finally {
      setSending(false);
    }
  }

  async function recheck() {
    const { data } = await supabase.auth.refreshSession();
    if (data.user?.email_confirmed_at) navigate({ to: "/dashboard" });
    else toast.error(t("verify_email.not_yet", { defaultValue: "Not verified yet. Check your inbox." }));
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-20">
        <div className="mx-auto max-w-xl border border-border bg-card p-8">
          <div className="label-mono">[EMAIL VERIFICATION]</div>
          <h1 className="mt-2 text-4xl font-black uppercase italic tracking-tighter">
            {t("verify_email.title", { defaultValue: "Verify your email" })}
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            {t("verify_email.body", {
              defaultValue:
                "We sent a confirmation link to your inbox. Click it to unlock the platform. Until then, access to Pit Call features is limited.",
            })}
          </p>
          {user?.email && <p className="mt-3 font-mono text-xs">{user.email}</p>}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={resend}
              disabled={sending}
              className="bg-racing-red px-4 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
            >
              {t("verify_email.resend", { defaultValue: "Resend email" })}
            </button>
            <button
              onClick={recheck}
              className="border border-border px-4 py-3 text-xs font-bold uppercase tracking-widest hover:bg-secondary"
            >
              {t("verify_email.recheck", { defaultValue: "I have verified" })}
            </button>
            <button
              onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/" }))}
              className="border border-border px-4 py-3 text-xs font-bold uppercase tracking-widest hover:bg-secondary"
            >
              {t("nav.signout", { defaultValue: "Sign out" })}
            </button>
          </div>

          <div className="mt-6 text-xs text-muted-foreground">
            <Link to="/" className="font-bold text-racing-red">
              {t("common.back_home", { defaultValue: "Back to home" })}
            </Link>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
