import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const searchSchema = z.object({
  mode: fallback(z.enum(["signin", "signup"]), "signin").default("signin"),
  type: fallback(z.enum(["freelancer", "team"]), "freelancer").default("freelancer"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: zodValidator(searchSchema),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useTranslation();
  const { mode, type } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [userType, setUserType] = useState<"freelancer" | "team">(type);
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  async function handleGoogle() {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in failed");
        setLoading(false);
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign-in failed");
      setLoading(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { user_type: userType, display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Welcome to the paddock! 5 tokens credited.");
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page grid gap-12 py-16 md:grid-cols-2">
        <div className="hidden md:block">
          <div className="label-mono mb-4">{isSignup ? "[REGISTRATION]" : "[SIGN IN]"}</div>
          <h1 className="text-5xl font-black uppercase italic tracking-tighter">
            {isSignup ? t("auth.signup_title") : t("auth.signin_title")}
          </h1>
          <p className="mt-4 max-w-md text-sm text-muted-foreground">
            {isSignup
              ? "Publish your calendar, get auto-matched, spend tokens to reveal counterparties."
              : "Pick up where you left off."}
          </p>
        </div>

        <div className="border border-border bg-card p-8">
          {isSignup && (
            <div className="mb-6">
              <div className="label-mono mb-3">{t("auth.which_are_you")}</div>
              <div className="grid grid-cols-2 gap-2">
                {(["freelancer", "team"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setUserType(v)}
                    className={`border p-3 text-left transition-colors ${userType === v ? "border-racing-red bg-racing-red/10" : "border-border hover:bg-secondary"}`}
                  >
                    <div className="text-sm font-bold">{v === "freelancer" ? t("auth.type_freelancer") : t("auth.type_team")}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {v === "freelancer" ? t("auth.type_freelancer_desc") : t("auth.type_team_desc")}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleEmail} className="space-y-4">
            {isSignup && (
              <div>
                <label className="label-mono">{userType === "team" ? t("auth.team_name") : t("auth.display_name")}</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                  className="mt-2 w-full border border-border bg-background px-4 py-3 focus:border-racing-red focus:outline-none"
                />
              </div>
            )}
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
            <div>
              <label className="label-mono">{t("auth.password")}</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full border border-border bg-background px-4 py-3 focus:border-racing-red focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-racing-red py-3 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:brightness-110 disabled:opacity-60"
            >
              {isSignup ? t("auth.create_account") : t("auth.continue_email")}
            </button>
          </form>

          <div className="my-4 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">— or —</div>

          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full border border-border py-3 text-sm font-bold uppercase tracking-widest transition-colors hover:bg-secondary disabled:opacity-60"
          >
            {t("auth.continue_google")}
          </button>

          <div className="mt-6 text-center text-xs text-muted-foreground">
            {isSignup ? t("auth.have_account") : t("auth.no_account")}{" "}
            <Link to="/auth" search={{ mode: isSignup ? "signin" : "signup", type: userType }} className="font-bold text-racing-red">
              {isSignup ? t("nav.signin") : t("nav.signup")}
            </Link>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
