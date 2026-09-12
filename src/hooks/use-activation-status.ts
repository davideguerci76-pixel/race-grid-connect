import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type ActivationReason = "missing_role" | "missing_phone" | "missing_availability" | "stale_availability";

export type ActivationStatus = {
  is_freelancer: boolean;
  ready: boolean;
  reasons: ActivationReason[];
  has_role?: boolean;
  has_phone?: boolean;
  active_days?: number;
  future_days?: number;
  stale_days?: number;
};

export const ACTIVATION_QUERY_KEY = "activation-status";

/**
 * READY TO MATCH state, derived server-side by `my_activation_status()`
 * (role_group + availability_day_active + phone validation). Never cached as authority:
 * refetched on every mount and window focus so lost readiness resurfaces automatically.
 */
export function useActivationStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [ACTIVATION_QUERY_KEY, user?.id],
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<ActivationStatus> => {
      const { data, error } = await (supabase.rpc as any)("my_activation_status");
      if (error) throw new Error(error.message);
      return (data ?? { is_freelancer: false, ready: false, reasons: [] }) as ActivationStatus;
    },
  });
}
