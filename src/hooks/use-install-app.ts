import { useCallback, useEffect, useState } from "react";
import { isStandalone } from "@/lib/pwa/register-sw";
import {
  getDeferredPrompt,
  initInstallPromptCapture,
  promptInstall,
  subscribeInstallPrompt,
  wasInstalled,
} from "@/lib/pwa/install-prompt";

export type InstallMode =
  | "hidden" // already installed / SSR / nothing to offer
  | "prompt" // native beforeinstallprompt available (Android/Chromium/desktop)
  | "ios" // Safari iOS/iPadOS: manual Share → Add to Home Screen
  | "manual"; // other browsers without beforeinstallprompt

function isIosLike(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && (navigator as Navigator).maxTouchPoints > 1);
}

/** Drives the "Install Pit Call" CTA on the dashboard. */
export function useInstallApp() {
  const [mode, setMode] = useState<InstallMode>("hidden");
  const [busy, setBusy] = useState(false);

  const compute = useCallback(() => {
    if (typeof window === "undefined") return setMode("hidden");
    if (isStandalone() || wasInstalled()) return setMode("hidden");
    if (getDeferredPrompt()) return setMode("prompt");
    if (isIosLike()) return setMode("ios");
    setMode("manual");
  }, []);

  useEffect(() => {
    initInstallPromptCapture();
    compute();
    const unsub = subscribeInstallPrompt(compute);
    // Chromium can fire the event a beat after hydration.
    const t = window.setTimeout(compute, 1500);
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, [compute]);

  const install = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await promptInstall();
      compute();
      return ok;
    } finally {
      setBusy(false);
    }
  }, [compute]);

  return { mode, busy, install };
}
