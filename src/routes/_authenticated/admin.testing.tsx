import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Database,
  FlaskConical,
  Loader2,
  RefreshCw,
  Star,
  Timer,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import {
  assignTestPools,
  generatePoolPitCalls,
  generatePoolRatings,
  generateTestDataset,
  getTestEnvironmentStats,
  purgeTestEnvironment,
  runTestAvailabilityRecomputeQueue,
  runTestCalendarStaleJob,
  runTestEngagementJobs,
  runTestAntiGhostingJobs,
} from "@/lib/testlab.functions";
import { listDemoScenarios, resetAndSeedDemoScenario, runDemoJob, verifyDemoScenario } from "@/lib/demo.functions";
import { PRESET_SIZES } from "@/lib/testlab-generator";
import { AdminEnvSwitch, useAdminEnv } from "@/components/admin-env-switch";
import { toastError } from "@/lib/errors";

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
    onError: (e) => toastError(e),
  });

  const purgeMut = useMutation({
    mutationFn: () => purgeFn({ data: { confirm: "DELETE TEST DATA" as const } }),
    onSuccess: (r: any) => {
      toast.success(`Test environment purged (${r.users_deleted} accounts removed)`);
      setConfirmText("");
      qc.invalidateQueries();
    },
    onError: (e) => toastError(e),
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
    onError: (e) => toastError(e),
  });

  const ratingsMut = useMutation({
    mutationFn: () => poolRatingsFn(),
    onSuccess: (r: any) => {
      toast.success(`${r.ratings} ratings on ${r.engagements} new completed engagements`);
      if (r.errors?.length) toast.warning(r.errors[0]);
      qc.invalidateQueries();
    },
    onError: (e) => toastError(e),
  });

  const poolCallsMut = useMutation({
    mutationFn: () => poolCallsFn(),
    onSuccess: (r: any) => {
      toast.success(`${r.created} My Pool Pit Calls created (target ${r.target})`);
      if (r.errors?.length) toast.warning(r.errors[0]);
      qc.invalidateQueries();
    },
    onError: (e) => toastError(e),
  });

  const jobsFn = useServerFn(runTestEngagementJobs);
  const jobsMut = useMutation({
    mutationFn: () => jobsFn(),
    onSuccess: (r: any) => {
      toast.success(`Time jobs run on TEST: ${r.deadlines} deadline actions, ${r.completed} engagements completed, ${r.hotPartialNotifications} HOT Partial notifications`);
      qc.invalidateQueries();
    },
    onError: (e) => toastError(e),
  });

  const calFn = useServerFn(runTestCalendarStaleJob);
  const calMut = useMutation({
    mutationFn: () => calFn(),
    onSuccess: (r: any) => {
      toast.success(`Calendar-stale job run on TEST: ${r.notifications} notifications emitted`);
      qc.invalidateQueries();
    },
    onError: (e) => toastError(e),
  });

  const ghostFn = useServerFn(runTestAntiGhostingJobs);
  const ghostMut = useMutation({
    mutationFn: () => ghostFn(),
    onSuccess: (r: any) => {
      toast.success(
        `Anti-ghosting job run on TEST: ${r.contactChecks} contact checks, ${r.reminders} team reminders, ${r.released} engagements released`,
      );
      qc.invalidateQueries();
    },
    onError: (e) => toastError(e),
  });

  const queueFn = useServerFn(runTestAvailabilityRecomputeQueue);
  const queueMut = useMutation({
    mutationFn: () => queueFn(),
    onSuccess: (r: any) => {
      toast.success(`Availability recompute queue (TEST): ${r.processed} processed, ${r.pending} still pending`);
      qc.invalidateQueries();
    },
    onError: (e) => toastError(e),
  });


  // ---------------- DEMO scenarios ----------------
  const scenariosFn = useServerFn(listDemoScenarios);
  const seedFn = useServerFn(resetAndSeedDemoScenario);
  const verifyFn = useServerFn(verifyDemoScenario);
  const demoJobFn = useServerFn(runDemoJob);
  const [demoConfirm, setDemoConfirm] = useState("");

  const { data: scenarios } = useQuery({ queryKey: ["demo-scenarios"], queryFn: () => scenariosFn() });

  const seedMut = useMutation({
    mutationFn: (id: string) => seedFn({ data: { scenario_id: id, confirm: "RESET TEST DATA" as const } }),
    onSuccess: (r: any) => {
      if (r.status === "READY") toast.success(`Demo ${r.scenario_id} ready — anchor ${r.anchor}`);
      else toast.warning(`Demo ${r.scenario_id} seeded but verification failed (${r.failures} checks)`);
      setDemoConfirm("");
      qc.invalidateQueries();
    },
    onError: (e) => toastError(e),
  });

  const verifyMut = useMutation({
    mutationFn: (id: string) => verifyFn({ data: { scenario_id: id } }),
    onSuccess: (r: any) => {
      if (r.status === "READY") toast.success("Verification passed — demo is READY");
      else toast.warning(`Verification failed: ${r.failures} checks`);
      qc.invalidateQueries();
    },
    onError: (e) => toastError(e),
  });

  const demoJobMut = useMutation({
    mutationFn: (job: string) => demoJobFn({ data: { job: job as never } }),
    onSuccess: (r: any) => {
      toast.success(`Runner "${r.job}" done (${r.result})`);
      qc.invalidateQueries();
    },
    onError: (e) => toastError(e),
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
        <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest">
          <BookOpen className="size-4" /> Demo scenarios
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Deterministic, resettable commercial demo. “Reset &amp; seed” <span className="text-racing-red">deletes the
          whole TEST environment</span> (including any randomly generated dataset) and rebuilds the scenario cast,
          calendars, pool and pre-seeded SOS situation with relative dates. LIVE data is snapshotted before and after and
          the seed aborts if it changes. Type
          <span className="mx-1 font-mono text-foreground">RESET TEST DATA</span> to enable the buttons.
        </p>

        <input
          value={demoConfirm}
          onChange={(e) => setDemoConfirm(e.target.value)}
          placeholder="RESET TEST DATA"
          className="mb-3 w-56 border border-border bg-background px-2 py-1.5 font-mono text-sm"
        />

        <div className="space-y-3">
          {(scenarios ?? []).map((s: any) => (
            <div key={s.id} className="border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-widest">
                    {s.title.en} <span className="text-muted-foreground">v{s.version}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{s.description.en}</p>
                </div>
                <StatusPill status={s.status} failures={s.failures} />
              </div>

              <div className="mt-2 font-mono text-[11px] text-muted-foreground">
                {s.seeded ? `anchor ${s.anchor_date} · seeded ${new Date(s.seeded_at).toLocaleString()}` : "not seeded"}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => seedMut.mutate(s.id)}
                  disabled={demoConfirm !== "RESET TEST DATA" || seedMut.isPending}
                  className="inline-flex items-center gap-2 bg-racing-red px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-40"
                >
                  {seedMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                  Reset &amp; seed
                </button>
                <button
                  onClick={() => verifyMut.mutate(s.id)}
                  disabled={!s.seeded || verifyMut.isPending}
                  className="inline-flex items-center gap-2 border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary disabled:opacity-40"
                >
                  {verifyMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                  Verify
                </button>
                <Link
                  to="/admin/demo-guide/$scenarioId"
                  params={{ scenarioId: s.id }}
                  className="inline-flex items-center gap-2 border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
                >
                  <BookOpen className="size-3" /> Open demo guide
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Demo runners (TEST scope only)
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["pending_review", "Activate pending reviews"],
              ["recompute", "Recompute matches"],
              ["availability_queue", "Drain availability queue"],
              ["availability_opportunity", "Availability opportunities"],
              ["team_match_activity", "Team match notifications"],
              ["hot_partial", "Hot partial notifications"],
            ].map(([job, label]) => (
              <button
                key={job}
                onClick={() => demoJobMut.mutate(job)}
                disabled={demoJobMut.isPending}
                className="inline-flex items-center gap-2 border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary disabled:opacity-40"
              >
                <Timer className="size-3" /> {label}
              </button>
            ))}
          </div>
        </div>
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

      <div className="border border-border p-4">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest">
          <Users className="size-4" /> Pool simulation
        </div>
        <p className="mb-4 text-[11px] text-muted-foreground">
          Advanced simulation on the TEST dataset: build trusted pools, seed bidirectional ratings and fire My Pool Pit
          Calls so the matching engine returns real, targeted results to debug. Each step can also be done manually by
          impersonating a user with “Login as user”.
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          <SimCard
            title="Add to pool"
            desc="Assigns test freelancers to the pools of the test teams, creating the pool membership links."
            pending={poolMut.isPending}
            onClick={() => poolMut.mutate()}
            icon={<Users className="size-3" />}
          />
          <SimCard
            title="Generate pool ratings"
            desc="Creates completed engagements for every pool pair and bidirectional ratings (team → freelancer and back)."
            pending={ratingsMut.isPending}
            onClick={() => ratingsMut.mutate()}
            icon={<Star className="size-3" />}
          />
          <SimCard
            title="Generate My Pool Pit Calls"
            desc="Creates Pit Calls in pool mode (≈ half of the generated teams) aligned to pool members' availability."
            pending={poolCallsMut.isPending}
            onClick={() => poolCallsMut.mutate()}
            icon={<FlaskConical className="size-3" />}
          />
          <SimCard
            title="Run time jobs (TEST)"
            desc="Runs the real 24h/12h reminders, match-request expiry (with the usual refund trivio) and engagement auto-complete on TEST records only. LIVE data is never touched."
            pending={jobsMut.isPending}
            onClick={() => jobsMut.mutate()}
            icon={<Timer className="size-3" />}
          />
          <SimCard
            title="Run calendar-stale job (TEST)"
            desc="Runs the real calendar freshness job (needs review after 30 days, unconfirmed after 60) on TEST records only. LIVE data is never touched."
            pending={calMut.isPending}
            onClick={() => calMut.mutate()}
            icon={<Timer className="size-3" />}
          />
          <SimCard
            title="Drain availability queue (TEST)"
            desc="Processes the debounced availability recompute queue for TEST freelancers whose delay has elapsed. LIVE data is never touched."
            pending={queueMut.isPending}
            onClick={() => queueMut.mutate()}
            icon={<Timer className="size-3" />}
          />
          <SimCard
            title="Run anti-ghosting job (TEST)"
            desc="Runs the real anti-ghosting lifecycle (freelancer contact check, team reminders 1 and 2, auto-release of ghosted engagements) on TEST records only. LIVE data is never touched."
            pending={ghostMut.isPending}
            onClick={() => ghostMut.mutate()}
            icon={<Timer className="size-3" />}
          />
        </div>

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

function SimCard({
  title,
  desc,
  pending,
  onClick,
  icon,
}: {
  title: string;
  desc: string;
  pending: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between border border-border p-3">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-widest">{title}</div>
        <p className="mt-1 text-[11px] text-muted-foreground">{desc}</p>
      </div>
      <button
        onClick={onClick}
        disabled={pending}
        className="mt-3 inline-flex items-center justify-center gap-2 border border-racing-red px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10 disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3 animate-spin" /> : icon}
        Run
      </button>
    </div>
  );
}

function StatusPill({ status, failures }: { status: string | null; failures: number | null }) {
  if (!status) return <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Not seeded</span>;
  const ok = status === "READY";
  return (
    <span
      className={`inline-flex items-center gap-1 border px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${
        ok ? "border-racing-green text-racing-green" : "border-racing-red text-racing-red"
      }`}
    >
      {ok ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      {ok ? "Ready" : `Verification failed${failures ? ` (${failures})` : ""}`}
    </span>
  );
}
