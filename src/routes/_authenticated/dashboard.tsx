import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { usePushLastSeen } from "@/hooks/use-push-last-seen";

function DashboardLayout() {
  const { user } = useAuth();
  usePushLastSeen(user?.id);
  return <Outlet />;
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardLayout,
});
