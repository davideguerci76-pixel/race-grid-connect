import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FlaskConical, Radio } from "lucide-react";
import { getAdminEnvironment, setAdminEnvironment } from "@/lib/testlab.functions";

export function useAdminEnv() {
  const fn = useServerFn(getAdminEnvironment);
  return useQuery({ queryKey: ["admin-env"], queryFn: () => fn(), staleTime: 10_000 });
}

export function AdminEnvSwitch() {
  const qc = useQueryClient();
  const setFn = useServerFn(setAdminEnvironment);
  const { data } = useAdminEnv();
  const isTest = !!data?.is_test;

  const mut = useMutation({
    mutationFn: (next: boolean) => setFn({ data: { is_test: next } }),
    onSuccess: (r: any) => {
      toast.success(r.is_test ? "Switched to TEST environment" : "Switched to LIVE environment");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="inline-flex border border-border">
      <button
        onClick={() => mut.mutate(false)}
        disabled={mut.isPending}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
          !isTest ? "bg-racing-red text-white" : "text-muted-foreground hover:bg-secondary"
        }`}
      >
        <Radio className="size-3" /> Live
      </button>
      <button
        onClick={() => mut.mutate(true)}
        disabled={mut.isPending}
        className={`inline-flex items-center gap-1.5 border-l border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
          isTest ? "bg-racing-yellow text-carbon" : "text-muted-foreground hover:bg-secondary"
        }`}
      >
        <FlaskConical className="size-3" /> Test
      </button>
    </div>
  );
}

export function AdminEnvBanner() {
  const { data } = useAdminEnv();
  if (!data?.is_test) return null;
  return (
    <div className="mb-4 flex items-center gap-2 border border-racing-yellow bg-racing-yellow/10 px-3 py-2">
      <FlaskConical className="size-4 text-racing-yellow" />
      <span className="text-[11px] font-bold uppercase tracking-widest text-racing-yellow">
        Test environment active — every admin view and action is scoped to synthetic data only
      </span>
    </div>
  );
}
