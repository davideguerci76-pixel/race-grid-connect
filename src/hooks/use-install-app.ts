import { useCallback, useEffect, useRef, useState } from "react";
import { isStandalone } from "@/lib/pwa/register-sw";
import {
  getDeferredPrompt,
  initInstallPromptCapture,
  promptInstall,
  subscribeInstallPrompt,
  wasInstalled,
  type InstallResult,
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

/**
 * True only for real mobile/tablet devices. Never viewport-width based: a
 * resized desktop browser must NOT be treated as a smartphone. Combines
 * User-Agent Client Hints, UA string and the primary pointer type.
 */
export function isMobileOrTabletDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (typeof uaData?.mobile === "boolean") return uaData.mobile || isIosLike();
  const ua = navigator.userAgent;
  if (isIosLike()) return true; // iPhone/iPad/iPod (+ iPadOS "Macintosh" spoof)
  if (/android/i.test(ua)) return true; // Android phones & tablets
  if (/mobile|tablet|kindle|silk|playbook|windows phone/i.test(ua)) return true;
  // Touch-capable laptop (Windows/macOS/Linux) is still a desktop: exclude it.
  return false;
}

/** Drives the "Install Pit Call" CTA on the dashboard. */
export function useInstallApp() {
  const [mode, setMode] = useState<InstallMode>("hidden");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const safety = useRef<number | null>(null);

  const compute = useCallback(() => {
    if (typeof window === "undefined") return setMode("hidden");
    if (!isMobileOrTabletDevice()) return setMode("hidden"); // never promote install on desktop
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
    const mq = window.matchMedia?.("(display-mode: standalone)");
    mq?.addEventListener?.("change", compute);
    window.addEventListener("appinstalled", compute);
    return () => {
      unsub();
      window.clearTimeout(t);
      mq?.removeEventListener?.("change", compute);
      window.removeEventListener("appinstalled", compute);
      if (safety.current) window.clearTimeout(safety.current);
    };
  }, [compute]);

  const install = useCallback(async (): Promise<InstallResult> => {
    setBusy(true);
    setFailed(false);
    // Hard safety net: the button can never stay in loading state.
    if (safety.current) window.clearTimeout(safety.current);
    safety.current = window.setTimeout(() => setBusy(false), 5000);

    try {
      const result = await promptInstall();
      if (result === "unavailable") {
        setFailed(true);
        setMode("manual");
      } else {
        compute();
      }
      return result;
    } catch {
      setFailed(true);
      setMode("manual");
      return "unavailable";
    } finally {
      if (safety.current) window.clearTimeout(safety.current);
      safety.current = null;
      setBusy(false);
    }
  }, [compute]);

  return { mode, busy, failed, install };
}
