import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";

import { Menu, X, Bell } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { LanguageSwitcher } from "./language-switcher";
import { TokenBadge } from "./token-badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { checkAmIAdmin } from "@/lib/admin.functions";
import { getUnreadNotificationCount } from "@/lib/paddock.functions";
import logoCompact from "@/assets/pitcall-logo-compact.png.asset.json";


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
        supabase.from("profiles").select("id, display_name, first_name, last_name, avatar_url, user_type, preferred_language").eq("id", user.id).maybeSingle(),
        supabase.rpc("my_token_balance"),
      ]);
      if (!p) return null;
      const legal = [(p as any).first_name, (p as any).last_name].filter(Boolean).join(" ").trim();
      return {
        ...p,
        display_name: (p as any).user_type === "freelancer" ? (legal || (p as any).display_name) : (p as any).display_name,
        token_balance: (balance as number | null) ?? 0,
      };
    },
  });

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => (await checkAdmin()).isAdmin,
  });

  const getUnread = useServerFn(getUnreadNotificationCount);
  const qc = useQueryClient();
  const { data: unread } = useQuery({
    queryKey: ["unread-notifications", user?.id],
    enabled: !!user,
    queryFn: async () => (await getUnread()).count,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  // Realtime: bump the badge the instant a notification is inserted for this user,
  // even when the freelancer is not on the engagements page.
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`notif-badge-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["unread-notifications", user.id] }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["unread-notifications", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);



  async function handleSignOut() {
    setOpen(false);
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const navLinkCls = "transition-colors hover:text-racing-red";
  const activeCls = { className: "text-foreground" };

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="container-page flex h-16 min-w-0 items-center justify-between gap-2 sm:gap-3">
        <Link to={user ? "/dashboard" : "/"} className="flex shrink-0 items-center" onClick={() => setOpen(false)}>
          <img
            src={logoCompact.url}
            alt="Pit Call"
            width={1246} height={211}
            className="h-8 w-auto max-w-[45vw] object-contain mix-blend-screen sm:h-11 md:h-12"
          />
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
                  {t("sweep_profile.header.admin")}
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
              <Link
                to="/dashboard/notifications"
                aria-label={t("sweep_profile.header.notifications")}
                className="relative grid h-10 w-10 place-items-center border border-border transition-colors hover:bg-secondary"
              >
                <Bell className="size-4" />
                {(unread ?? 0) > 0 && (
                  <span className="absolute -right-1 -top-1 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-racing-red px-1 font-mono text-[10px] font-black text-white">
                    {unread}
                  </span>
                )}
              </Link>
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
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 lg:hidden">
          {user && <TokenBadge balance={profile?.token_balance ?? 0} />}
          {user && (
            <Link
              to="/dashboard/notifications"
              aria-label={t("sweep_profile.header.notifications")}
              className="relative grid h-10 w-10 place-items-center border border-border transition-colors hover:bg-secondary"
            >
              <Bell className="size-4" />
              {(unread ?? 0) > 0 && (
                <span className="absolute -right-1 -top-1 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-racing-red px-1 font-mono text-[10px] font-black text-white">
                  {unread}
                </span>
              )}
            </Link>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={t("sweep_profile.header.toggle_menu")}
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
                    {t("sweep_profile.header.admin")}
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
