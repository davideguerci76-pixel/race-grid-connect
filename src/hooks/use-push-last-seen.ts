import { useEffect } from "react";
import { touchPushSubscription } from "@/lib/push.functions";

const KEY = "pitcallPushSeen";
const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * Refreshes `push_subscriptions.last_seen_at` when an authenticated session
 * actually opens the app on a device that has push enabled.
 *
 * Deliberately minimal: it runs once per mount, is throttled client-side to one
 * call per device per day (and again server-side), and never touches the
 * service worker or push delivery.
 */
export function usePushLastSeen(userId: string | undefined) {
  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;
    let cancelled = false;

    const run = async () => {
      try {
        const last = Number(window.localStorage.getItem(KEY) ?? 0);
        if (last && Date.now() - last < ONE_DAY) return;
        if (!("serviceWorker" in navigator)) return;
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (!sub || cancelled) return;
        await touchPushSubscription({ data: { endpoint: sub.endpoint } });
        window.localStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* best-effort telemetry-free touch — never surfaced to the user */
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [userId]);
}
