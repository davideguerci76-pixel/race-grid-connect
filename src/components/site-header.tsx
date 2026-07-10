import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { LanguageSwitcher } from "./language-switcher";
import { TokenBadge } from "./token-badge";
import { useQuery } from "@tanstack/react-query";

export function SiteHeader() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const [{ data: p }, { data: balance }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url, user_type, preferred_language").eq("id", user.id).maybeSingle(),
        supabase.rpc("my_token_balance"),
      ]);
      return p ? { ...p, token_balance: (balance as number | null) ?? 0 } : null;
    },
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link to="/" className="flex shrink-0 items-center gap-2 text-xl font-black italic tracking-tighter">
          <span className="inline-block h-6 w-6 skew-x-[-15deg] bg-racing-red" />
          PADDOCK<span className="text-racing-red">PRO</span>
        </Link>
        <div className="hidden gap-6 text-xs font-bold uppercase tracking-widest text-muted-foreground md:flex">
          <Link to="/jobs" className="transition-colors hover:text-racing-red" activeProps={{ className: "text-foreground" }}>
            <span suppressHydrationWarning>{t("nav.jobs")}</span>
          </Link>
          {user && (
            <>
              <Link to="/dashboard" className="transition-colors hover:text-racing-red" activeProps={{ className: "text-foreground" }}>
                <span suppressHydrationWarning>{t("nav.dashboard")}</span>
              </Link>
              <Link to="/dashboard/profile" className="transition-colors hover:text-racing-red" activeProps={{ className: "text-foreground" }}>
                <span suppressHydrationWarning>{t("nav.profile")}</span>
              </Link>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {user ? (
            <>
              <TokenBadge balance={profile?.token_balance ?? 0} />
              <button
                onClick={handleSignOut}
                className="border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors hover:bg-secondary"
              >
                <span suppressHydrationWarning>{t("nav.signout")}</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/auth" search={{ mode: "signin" as const }} className="border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors hover:bg-secondary">
                <span suppressHydrationWarning>{t("nav.signin")}</span>
              </Link>
              <Link to="/auth" search={{ mode: "signup" as const }} className="bg-racing-red px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-white transition-colors hover:brightness-110">
                <span suppressHydrationWarning>{t("nav.signup")}</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
