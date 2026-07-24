import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Menu, X, Bell } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { LanguageSwitcher } from "./language-switcher";
import { TokenBadge } from "./token-badge";
import { useQuery } from "@tanstack/react-query";
import { checkAmIAdmin } from "@/lib/admin.functions";
import { getUnreadNotificationCount } from "@/lib/paddock.functions";


export function SiteHeader() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const checkAdmin = useServerFn(checkAmIAdmin);

  const { data: profile } = useQuery({
    queryKey: ["profile-summary", user?.id],
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

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => (await checkAdmin()).isAdmin,
  });

  async function handleSignOut() {
    setOpen(false);
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const navLinkCls = "transition-colors hover:text-racing-red";
  const activeCls = { className: "text-foreground" };

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <Link to={user ? "/dashboard" : "/"} className="flex shrink-0 items-center gap-2 text-xl font-black italic tracking-tighter" onClick={() => setOpen(false)}>
          <span className="inline-block h-6 w-6 skew-x-[-15deg] bg-racing-red" />
          PADDOCK<span className="text-racing-red">PRO</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden gap-6 text-xs font-bold uppercase tracking-widest text-muted-foreground lg:flex">
          <Link to="/jobs" className={navLinkCls} activeProps={activeCls}>
            <span suppressHydrationWarning>{t("nav.jobs")}</span>
          </Link>
          {user && (
            <>
              <Link to="/dashboard" className={navLinkCls} activeProps={activeCls}>
                <span suppressHydrationWarning>{t("nav.dashboard")}</span>
              </Link>
              <Link to="/dashboard/profile" className={navLinkCls} activeProps={activeCls}>
                <span suppressHydrationWarning>{t("nav.profile")}</span>
              </Link>
              {isAdmin && (
                <Link to="/admin" className="text-racing-red transition-colors hover:brightness-125" activeProps={activeCls}>
                  ADMIN
                </Link>
              )}
            </>
          )}
        </div>

        {/* Desktop actions */}
        <div className="hidden items-center gap-2 lg:flex">
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

        {/* Mobile/tablet: token badge + hamburger */}
        <div className="flex items-center gap-2 lg:hidden">
          {user && <TokenBadge balance={profile?.token_balance ?? 0} />}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
            className="grid h-10 w-10 shrink-0 place-items-center border border-border transition-colors hover:bg-secondary"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile/tablet dropdown */}
      {open && (
        <div className="border-t border-border bg-background lg:hidden">
          <div className="container-page flex flex-col gap-1 py-4 text-sm font-bold uppercase tracking-widest">
            <Link to="/jobs" onClick={() => setOpen(false)} className="border-b border-border/50 py-3 hover:text-racing-red" activeProps={activeCls}>
              <span suppressHydrationWarning>{t("nav.jobs")}</span>
            </Link>
            {user && (
              <>
                <Link to="/dashboard" onClick={() => setOpen(false)} className="border-b border-border/50 py-3 hover:text-racing-red" activeProps={activeCls}>
                  <span suppressHydrationWarning>{t("nav.dashboard")}</span>
                </Link>
                <Link to="/dashboard/profile" onClick={() => setOpen(false)} className="border-b border-border/50 py-3 hover:text-racing-red" activeProps={activeCls}>
                  <span suppressHydrationWarning>{t("nav.profile")}</span>
                </Link>
                {isAdmin && (
                  <Link to="/admin" onClick={() => setOpen(false)} className="border-b border-border/50 py-3 text-racing-red hover:brightness-125" activeProps={activeCls}>
                    ADMIN
                  </Link>
                )}
              </>
            )}
            <div className="flex items-center justify-between gap-2 pt-4">
              <LanguageSwitcher align="left" />
              {user ? (
                <button
                  onClick={handleSignOut}
                  className="border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors hover:bg-secondary"
                >
                  <span suppressHydrationWarning>{t("nav.signout")}</span>
                </button>
              ) : (
                <div className="flex gap-2">
                  <Link to="/auth" search={{ mode: "signin" as const }} onClick={() => setOpen(false)} className="border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors hover:bg-secondary">
                    <span suppressHydrationWarning>{t("nav.signin")}</span>
                  </Link>
                  <Link to="/auth" search={{ mode: "signup" as const }} onClick={() => setOpen(false)} className="bg-racing-red px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-white transition-colors hover:brightness-110">
                    <span suppressHydrationWarning>{t("nav.signup")}</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
