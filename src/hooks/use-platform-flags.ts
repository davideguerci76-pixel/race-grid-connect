import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getPublicFlags, DEFAULT_FLAGS, type PlatformFlags } from "@/lib/flags.functions";

export function usePlatformFlags(): PlatformFlags {
  const fn = useServerFn(getPublicFlags);
  const { data } = useQuery({ queryKey: ["platform-flags"], queryFn: () => fn(), staleTime: 30_000 });
  return data ?? DEFAULT_FLAGS;
}

/**
 * Env-aware Pit Call launch gate for the signed-in user.
 * Mirrors the DB authority `pitcall_creation_allowed()`:
 *   allowed = env_is_test() OR flag_pitcall_creation_disabled < 1
 * Returns `null` while unresolved so callers can avoid flashing the LIVE block
 * to TEST/DEMO teams. The server re-enforces the same rule regardless.
 */
export function usePitcallCreationDisabled(): boolean | null {
  const { user } = useAuth();
  const flags = usePlatformFlags();
  const { data } = useQuery({
    queryKey: ["pitcall-creation-allowed", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pitcall_creation_allowed");
      if (error) throw error;
      return data === true;
    },
  });
  if (data !== undefined) return !data;
  // Public flag OFF ⇒ nobody is blocked, no need to wait for the env check.
  if (!flags.pitcallCreationDisabled) return false;
  return null;
}
