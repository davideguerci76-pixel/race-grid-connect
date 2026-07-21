import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { checkAmIAdmin } from "@/lib/admin.functions";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  component: AdminLayout,
});

function AdminLayout() {
  const check = useServerFn(checkAmIAdmin);
  const { data, isLoading } = useQuery({
    queryKey: ["am-i-admin"],
    queryFn: () => check(),
  });
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (isLoading) return <div className="container-page py-10 text-sm text-muted-foreground">Checking access…</div>;
  if (!data?.isAdmin) {
    throw redirect({ to: "/" });
  }

  const tabs = [
    { to: "/admin", label: "Freelancers" },
    { to: "/admin/teams", label: "Teams" },
    { to: "/admin/permissions", label: "Permissions" },
  ];

  return (
    <>
    <SiteHeader />
    <div className="container-page py-8">
      <div className="mb-6 flex items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-racing-red">Admin</div>
          <h1 className="text-2xl font-black italic tracking-tighter">Control Panel</h1>
        </div>
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
  );
}
