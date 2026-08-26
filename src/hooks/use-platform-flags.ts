import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicFlags, DEFAULT_FLAGS, type PlatformFlags } from "@/lib/flags.functions";

export function usePlatformFlags(): PlatformFlags {
  const fn = useServerFn(getPublicFlags);
  const { data } = useQuery({ queryKey: ["platform-flags"], queryFn: () => fn(), staleTime: 30_000 });
  return data ?? DEFAULT_FLAGS;
}
