import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPushPublicKey, savePushSubscription, deletePushSubscription } from "@/lib/push.functions";
import { isStandalone } from "@/lib/pwa/register-sw";

export type PushState = "unsupported" | "needs-install" | "default" | "granted" | "denied";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Web Push enrolment for the current device.
 * On iOS the Push API only exists once the app is installed to the Home Screen,
 * so we surface a distinct `needs-install` state instead of a dead button.
 */
export function usePushNotifications() {
  const [state, setState] = useState<PushState>("unsupported");
  const [busy, setBusy] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const publicKeyFn = useServerFn(getPushPublicKey);
  const saveFn = useServerFn(savePushSubscription);
  const deleteFn = useServerFn(deletePushSubscription);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) {
      setState(isIos() && !isStandalone() ? "needs-install" : "unsupported");
      setSubscribed(false);
      return;
    }
    setState(Notification.permission as PushState);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
    } catch {
      setSubscribed(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setState(permission as PushState);
      if (permission !== "granted") return false;

      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await publicKeyFn({});
      if (!publicKey) return false;

      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }));

      const json = sub.toJSON();
      await saveFn({
        data: {
          endpoint: sub.endpoint,
          p256dh: json.keys?.["p256dh"] ?? "",
          auth: json.keys?.["auth"] ?? "",
          user_agent: navigator.userAgent.slice(0, 400),
        },
      });
      setSubscribed(true);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [publicKeyFn, saveFn]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deleteFn({ data: { endpoint: sub.endpoint } }).catch(() => undefined);
        await sub.unsubscribe().catch(() => undefined);
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, [deleteFn]);

  return { state, subscribed, busy, enable, disable, refresh, standalone: isStandalone() };
}

/** Mirrors the unread notification count onto the app icon badge. */
export function useAppBadge(unread: number | undefined) {
  useEffect(() => {
    if (typeof navigator === "undefined" || unread === undefined) return;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
      if (unread > 0) void nav.setAppBadge?.(unread);
      else void nav.clearAppBadge?.();
    } catch {
      /* unsupported browser — ignore */
    }
  }, [unread]);
}
