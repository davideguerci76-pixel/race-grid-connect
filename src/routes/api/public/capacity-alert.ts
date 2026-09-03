import { createFileRoute } from "@tanstack/react-router";
import {
  CAPACITY_LEVEL_COPY,
  CAPACITY_LEVEL_LABEL,
  CAPACITY_THRESHOLDS,
  levelRank,
  type CapacityLevel,
  type CapacitySnapshot,
} from "@/lib/capacity";

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * State machine: an email is sent only when the LIVE level moves UP.
 * A downward move updates the stored level silently so a later real
 * escalation can alert again. Multi-level jumps produce a single email
 * for the new current level.
 */
export function decideCapacityTransition(previous: CapacityLevel, current: CapacityLevel) {
  return {
    shouldEmail: levelRank(current) > levelRank(previous),
    shouldPersist: current !== previous,
  };
}

export function describeDrivers(snapshot: CapacitySnapshot) {
  const names: Record<string, string> = {
    freelancers: "Total Freelancers",
    active_pit_calls: "Active Pit Calls",
    workload_index: "Workload Index",
  };
  const thresholdFor = (key: string): string => {
    const level = snapshot.overall_level;
    const pick = (t: { check: number; plan: number; upgrade: number }) =>
      level === "UPGRADE_NOW" ? t.upgrade : level === "PLAN_UPGRADE" ? t.plan : t.check;
    if (key === "freelancers") return `Freelancers >= ${pick(CAPACITY_THRESHOLDS.freelancers)}`;
    if (key === "active_pit_calls")
      return `Active Pit Calls >= ${pick(CAPACITY_THRESHOLDS.activePitCalls)}`;
    return `Workload Index >= ${pick(CAPACITY_THRESHOLDS.workloadIndex)}`;
  };
  return {
    drivers: snapshot.driving_indicators.map((d) => names[d]).join(", ") || "—",
    thresholds: snapshot.driving_indicators.map(thresholdFor).join(", ") || "—",
  };
}

export const Route = createFileRoute("/api/public/capacity-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const provided = request.headers.get("x-hook-secret") ?? "";
        const { data: cfg } = await supabaseAdmin
          .from("email_hook_config" as never)
          .select("secret")
          .maybeSingle<{ secret: string }>();
        if (!cfg?.secret || !timingSafeEqual(provided, cfg.secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Capacity monitoring must never break business flows: everything below
        // is isolated and only reports its own failure.
        try {
          const { readLiveCapacitySnapshot } = await import("@/lib/capacity.server");
          const snapshot = await readLiveCapacitySnapshot(supabaseAdmin);

          const { data: state } = await supabaseAdmin
            .from("platform_capacity_state" as never)
            .select("last_level")
            .maybeSingle<{ last_level: CapacityLevel }>();
          const previous = (state?.last_level ?? "NORMAL") as CapacityLevel;
          const current = snapshot.overall_level;

          const { shouldEmail, shouldPersist } = decideCapacityTransition(previous, current);
          if (!shouldPersist) {
            return Response.json({ ok: true, level: current, emailed: false });
          }

          let emailed = false;
          if (shouldEmail) {
            const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
            const { drivers, thresholds } = describeDrivers(snapshot);
            const result = await sendTemplateEmail("capacityAlert", "info@pitcall.net", {
              templateData: {
                level: CAPACITY_LEVEL_LABEL[current],
                freelancers: snapshot.total_freelancers,
                activePitCalls: snapshot.active_pit_calls,
                workloadIndex: snapshot.workload_index,
                teams: snapshot.total_teams,
                drivers,
                thresholds,
                action: CAPACITY_LEVEL_COPY[current],
              },
              idempotencyKey: `capacity-${current}-${snapshot.total_freelancers}-${snapshot.active_pit_calls}`,
            });
            emailed = result.sent;
            if (!result.sent) {
              // Suppressed recipient: state still advances, nothing to retry.
              console.warn("[capacity] alert suppressed for info@pitcall.net");
            }
          }

          const patch: Record<string, unknown> = {
            last_level: current,
            updated_at: new Date().toISOString(),
            last_checked_at: new Date().toISOString(),
          };
          if (emailed) {
            patch["last_notified_level"] = current;
            patch["last_notified_at"] = new Date().toISOString();
          }
          const { error: upErr } = await supabaseAdmin
            .from("platform_capacity_state" as never)
            .update(patch as never)
            .eq("id", true);
          if (upErr) console.error("[capacity] state update failed:", upErr.message);

          return Response.json({ ok: true, level: current, emailed });
        } catch (error) {
          // Never propagate: capacity observability failures stay contained.
          console.error("[capacity] check failed:", error);
          return Response.json({ ok: false }, { status: 200 });
        }
      },
    },
  },
});
