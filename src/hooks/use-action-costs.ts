import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getActionCosts, EMPTY_ACTION_COSTS, type ActionCosts } from "@/lib/action-costs.functions";

/** Server-returned token amounts for the labels that must show a number. */
export function useActionCosts(): ActionCosts {
  const fn = useServerFn(getActionCosts);
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["action-costs"],
    queryFn: () => fn(),
    staleTime: 60_000,
    enabled: !!user,
  });
  return data ?? EMPTY_ACTION_COSTS;
}
