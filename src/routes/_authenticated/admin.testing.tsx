import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Database, FlaskConical, Loader2, Trash2 } from "lucide-react";
import {
  assignTestPools,
  generatePoolPitCalls,
  generatePoolRatings,
  generateTestDataset,
  getTestEnvironmentStats,
  purgeTestEnvironment,
} from "@/lib/testlab.functions";
import { PRESET_SIZES } from "@/lib/testlab-generator";
import { AdminEnvSwitch, useAdminEnv } from "@/components/admin-env-switch";

export const Route = createFileRoute("/_authenticated/admin/testing")({
  ssr: false,
  component: TestingLab,
});

const PRESETS = ["small", "medium", "large", "stress"] as const;
const AREAS = ["italy", "europe", "worldwide"] as const;
const DENSITIES = ["sparse", "normal", "dense"] as const;

function TestingLab() {
  const qc = useQueryClient();
  const { data: env } = useAdminEnv();
  const statsFn = useServerFn(getTestEnvironmentStats);
  const genFn = useServerFn(generateTestDataset);
  const purgeFn = useServerFn(purgeTestEnvironment);

  const [preset, setPreset] = useState<(typeof PRESETS)[number]>("small");
  const [area, setArea] = useState<(typeof AREAS)[number]>("europe");
  const [density, setDensity] = useState<(typeof DENSITIES)[number]>("normal");
  const [confirmText, setConfirmText] = useState("");

  const { data: stats } = useQuery({ queryKey: ["testlab-stats"], queryFn: () => statsFn() });

  const genMut = useMutation({
    mutationFn: () => genFn({ data: { preset, area, density } }),
    onSuccess: (r: any) => {
      toast.success(`Generated ${r.freelancers} freelancers, ${r.teams} teams, ${r.requests} Pit Calls`);
      if (r.errors?.length) toast.warning(r.errors[0]);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Generation failed"),
  });

  const purgeMut = useMutation({
    mutationFn: () => purgeFn({ data: { confirm: "DELETE TEST DATA" as const } }),
    onSuccess: (r: any) => {
      toast.success(`Test environment purged (${r.users_deleted} accounts removed)`);
      setConfirmText("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Purge failed"),
  });

  const poolFn = useServerFn(assignTestPools);
  const poolRatingsFn = useServerFn(generatePoolRatings);
  const poolCallsFn = useServerFn(generatePoolPitCalls);

  const poolMut = useMutation({
    mutationFn: () => poolFn(),
    onSuccess: (r: any) => {
      toast.success(`${r.links} pool links created across ${r.teams} teams (${r.pool_total} total)`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Pool assignment failed"),
  });

  const ratingsMut = useMutation({
    mutationFn: () => poolRatingsFn(),
    onSuccess: (r: any) => {
      toast.success(`${r.ratings} ratings on ${r.engagements} new completed engagements`);
      if (r.errors?.length) toast.warning(r.errors[0]);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Rating generation failed"),
  });

  const poolCallsMut = useMutation({
    mutationFn: () => poolCallsFn(),
    onSuccess: (r: any) => {
      toast.success(`${r.created} My Pool Pit Calls created (target ${r.target})`);
      if (r.errors?.length) toast.warning(r.errors[0]);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Pool Pit Call generation failed"),
  });

  const size = PRESET_SIZES[preset];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border p-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-racing-yellow">
            <FlaskConical className="size-4" /> Environment
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            LIVE and TEST data are fully isolated: matches, engagements, statistics and emails never cross the boundary.
          </p>
        </div>
        <AdminEnvSwitch />
      </div>

      <div className="border border-border p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest">
          <Database className="size-4" /> Test data currently in the database
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Accounts", stats?.profiles],
            ["Pit Calls", stats?.requests],
            ["Matches", stats?.matches],
            ["Engagements", stats?.engagements],
            ["Availability days", stats?.availability],
          ].map(([label, value]) => (
            <div key={label as string} className="border border-border p-3">
              <div className="font-mono text-xl font-black">{(value as number) ?? 0}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label as string}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-border p-4">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-widest">Dataset generator</div>

        <div className="grid gap-4 md:grid-cols-3">
          <Group label="Preset">
            {PRESETS.map((p) => (
              <Chip key={p} active={preset === p} onClick={() => setPreset(p)}>
                {p}
              </Chip>
            ))}
          </Group>
          <Group label="Geographic area">
            {AREAS.map((a) => (
              <Chip key={a} active={area === a} onClick={() => setArea(a)}>
                {a}
              </Chip>
            ))}
          </Group>
          <Group label="Matching density">
            {DENSITIES.map((d) => (
              <Chip key={d} active={density === d} onClick={() => setDensity(d)}>
                {d}
              </Chip>
            ))}
          </Group>
        </div>

        <p className="mt-4 font-mono text-[11px] text-muted-foreground">
          Will create ≈ {size.freelancers} freelancers · {size.teams} teams · {size.requests} Pit Calls, with procedurally
          generated names, roles, skills, locations and availability calendars. Matching is recomputed automatically.
        </p>

        <button
          onClick={() => genMut.mutate()}
          disabled={genMut.isPending}
          className="mt-4 inline-flex items-center gap-2 bg-racing-red px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
        >
          {genMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <FlaskConical className="size-3" />}
          Generate test dataset
        </button>
        {genMut.isPending && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Creating accounts and calendars — larger presets can take a couple of minutes.
          </p>
        )}
        {!env?.is_test && (
          <p className="mt-2 text-[11px] text-racing-yellow">
            Generated data is always flagged as TEST. Switch the environment to TEST to browse it in the admin panel.
          </p>
        )}
      </div>

      <div className="border border-racing-red/50 bg-racing-red/5 p-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-racing-red">
          <AlertTriangle className="size-4" /> Danger zone — purge test environment
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Permanently deletes every TEST account and all related data. LIVE data is never touched. Type
          <span className="mx-1 font-mono text-foreground">DELETE TEST DATA</span> to enable the button.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE TEST DATA"
            className="w-56 border border-border bg-background px-2 py-1.5 font-mono text-sm"
          />
          <button
            onClick={() => purgeMut.mutate()}
            disabled={confirmText !== "DELETE TEST DATA" || purgeMut.isPending}
            className="inline-flex items-center gap-2 border border-racing-red px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10 disabled:opacity-40"
          >
            {purgeMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
            Purge test data
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
        active ? "border-racing-red bg-racing-red/10 text-racing-red" : "border-border hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}
