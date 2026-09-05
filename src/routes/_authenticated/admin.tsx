import { createFileRoute, Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { checkAmIAdmin } from "@/lib/admin.functions";
import { SiteHeader } from "@/components/site-header";
import { BackButton } from "@/components/back-button";
import { AdminEnvBanner, AdminEnvSwitch } from "@/components/admin-env-switch";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  component: AdminLayout,
});

function AdminLayout() {
  const { t } = useTranslation();
  const check = useServerFn(checkAmIAdmin);
  const { session, loading: authLoading } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["am-i-admin", session?.user.id],
    enabled: !!session?.access_token,
    retry: false,
    queryFn: async () => {
      try {
        return await check();
      } catch {
        return { isAdmin: false };
      }
    },
  });
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (authLoading || !session || isLoading || data === undefined) {
    return <div className="container-page py-10 text-sm text-muted-foreground">{t("sweep_admin_a.checking_access")}</div>;
  }
  if (!data.isAdmin) {
    return <Navigate to="/" />;
  }

  const tabs = [
    { to: "/admin", label: t("sweep_admin_a.tabs.freelancers") },
    { to: "/admin/teams", label: t("sweep_admin_a.tabs.teams") },
    { to: "/admin/pitcalls", label: t("sweep_admin_a.tabs.pitcalls") },
    { to: "/admin/permissions", label: t("sweep_admin_a.tabs.permissions") },
    { to: "/admin/matching", label: t("sweep_admin_a.tabs.matching") },
    { to: "/admin/taxonomy", label: "Taxonomy" },
    { to: "/admin/tokens", label: t("sweep_admin_a.tabs.tokens") },
    { to: "/admin/platform-rules", label: t("sweep_admin_a.tabs.platform_rules") },
    { to: "/admin/reviews", label: t("sweep_admin_a.tabs.reviews") },
    { to: "/admin/calendars", label: t("sweep_admin_a.tabs.calendars") },
    { to: "/admin/wiki", label: t("sweep_admin_a.tabs.wiki") },
    { to: "/admin/launch", label: t("sweep_admin_a.tabs.launch") },
    { to: "/admin/testing", label: t("sweep_admin_a.tabs.testing") },

  ];



  return (
    <>
    <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
    <div className="container-page py-8">
      <AdminEnvBanner />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-racing-red">{t("sweep_admin_a.admin_label")}</div>
          <h1 className="text-2xl font-black italic tracking-tighter">{t("sweep_admin_a.control_panel")}</h1>
        </div>
        <AdminEnvSwitch />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = path === t.to || (t.to === "/admin" && path === "/admin/");
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`border px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                active ? "border-racing-red bg-racing-red/10 text-racing-red" : "border-border hover:bg-secondary"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
    </>
  );
}

