import { useEffect, useState } from "react";

import { isStandalone } from "@/lib/pwa/register-sw";

const SESSION_KEY = "pitcall:splash-shown";
const HOLD_MS = 650;
const FADE_MS = 320;

/**
 * In-app launch splash: pure black with the full PITCALL logo.
 * Shown once per session, only when the app is launched standalone (installed PWA).
 * It never appears during in-app navigation and does not block rendering.
 */
export function AppSplash() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!isStandalone()) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(true);
    const fadeTimer = window.setTimeout(() => setFading(true), HOLD_MS);
    const hideTimer = window.setTimeout(() => setVisible(false), HOLD_MS + FADE_MS);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black transition-opacity ease-out"
      style={{ opacity: fading ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
    >
      <img
        src="/icons/splash-1024.png"
        alt=""
        className="w-[70%] max-w-[420px] select-none"
        draggable={false}
      />
    </div>
  );
}
