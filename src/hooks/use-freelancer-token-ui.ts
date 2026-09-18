import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePlatformFlags } from "@/hooks/use-platform-flags";

/**
 * TOKEN-FL-02 — single frontend authority for the Freelancer token UX.
 *
 * Presentation only: it never participates in crediting, spending, pricing or
 * any backend token authority. Wallet, ledger (`token_transactions`),
 * `credit_tokens`, signup/rating/calendar rewards and their idempotency keep
 * running unchanged while the toggle is OFF — a Freelancer simply does not see
 * the token economy.
 *
 * Team behaviour is never governed by this flag.
 *
 * States:
 *  - "loading" — role not resolved yet (fail-safe: render nothing token-related)
 *  - "visible" — token UX may render
 *  - "hidden"  — Freelancer + flag OFF
 */
export type TokenUiState = "loading" | "visible" | "hidden";

export function useTokenUiState(): TokenUiState {
  const { user } = useAuth();
  const flags = usePlatformFlags();
  const { data: userType, isLoading } = useQuery({
    queryKey: ["my-user-type", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_type")
        .eq("id", user!.id)
        .maybeSingle();
      return ((data as { user_type?: string } | null)?.user_type ?? null) as string | null;
    },
  });
  // While the session or the role is not resolved yet we stay in "loading":
  // token UX renders nothing, but no redirect is triggered either.
  if (!user) return "loading";
  if (isLoading || userType === undefined || userType === null) return "loading";
  if (userType !== "freelancer") return "visible";
  return flags.freelancerTokenVisibility ? "visible" : "hidden";
}

/** True only when token UX may be shown to the current user. Fail-safe: false. */
export function useFreelancerTokenUi(): boolean {
  return useTokenUiState() === "visible";
}
