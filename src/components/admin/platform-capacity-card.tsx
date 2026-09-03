import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetPlatformCapacity } from "@/lib/capacity.functions";
import {
  CAPACITY_DISCLAIMER,
  CAPACITY_LEVEL_COPY,
  CAPACITY_LEVEL_LABEL,
  CAPACITY_THRESHOLDS,
  nextThreshold,
  type CapacityLevel,
} from "@/lib/capacity";

const LEVEL_TONE: Record<CapacityLevel, string> = {
  NORMAL: "text-muted-foreground",
  CHECK_CAPACITY: "text-racing-yellow",
  PLAN_UPGRADE: "text-racing-yellow",
  UPGRADE_NOW: "text-racing-red",
};

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

function Metric({
  label,
  value,
  next,
}: {
  label: string;
  value: number;
  next: number | null;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">
        {fmt(value)}
        {next !== null ? <span className="text-muted-foreground"> / {fmt(next)}</span> : null}
      </div>
    </div>
  );
}

export function PlatformCapacityCard() {
  const get = useServerFn(adminGetPlatformCapacity);
  // On-demand only: computed when an admin opens this page. No polling.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-platform-capacity"],
    queryFn: () => get(),
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  if (isLoading || isError || !data) {
    return (
      <div className="border border-border bg-card p-4 text-[11px] text-muted-foreground">
        PLATFORM CAPACITY · LIVE — {isError ? "unavailable" : "loading…"}
      </div>
    );
  }

  return (
    <div className="border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-widest">
          Platform Capacity <span className="text-muted-foreground">· LIVE</span>
        </div>
        <div className={`text-xs font-black uppercase tracking-widest ${LEVEL_TONE[data.overall_level]}`}>
          {CAPACITY_LEVEL_LABEL[data.overall_level]}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Freelancers"
          value={data.total_freelancers}
          next={nextThreshold(data.total_freelancers, CAPACITY_THRESHOLDS.freelancers)}
        />
        <Metric
          label="Active Pit Calls"
          value={data.active_pit_calls}
          next={nextThreshold(data.active_pit_calls, CAPACITY_THRESHOLDS.activePitCalls)}
        />
        <Metric
          label="Workload Index"
          value={data.workload_index}
          next={nextThreshold(data.workload_index, CAPACITY_THRESHOLDS.workloadIndex)}
        />
        <Metric label="Teams" value={data.total_teams} next={null} />
      </div>

      <div className="mt-3 text-[11px] text-muted-foreground">{CAPACITY_LEVEL_COPY[data.overall_level]}</div>
      <div className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">{CAPACITY_DISCLAIMER}</div>
    </div>
  );
}
