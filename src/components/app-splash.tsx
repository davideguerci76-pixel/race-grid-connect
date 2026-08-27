import { useEffect, useState } from "react";

import { isStandalone } from "@/lib/pwa/register-sw";

const SESSION_KEY = "pitcall:splash-shown";
const FADE_IN_MS = 350;
const HOLD_MS = 900;
const FADE_OUT_MS = 300;

/**
 * In-app launch splash: pure black with the full PITCALL logo (headset + wordmark + BOX. NOW!).
 * Shown once per session, only when the app is launched standalone (installed PWA).
 * It never appears during in-app navigation and does not block rendering.
 */
export function AppSplash() {
  const [visible, setVisible] = useState(false);
  const [opacity, setOpacity] = useState(0);
  const [fadeMs, setFadeMs] = useState(FADE_IN_MS);

  useEffect(() => {
    if (!isStandalone()) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(true);

    const timers: number[] = [];
    // Fade in on the next frame so the transition actually runs.
    const raf = window.requestAnimationFrame(() => setOpacity(1));
    timers.push(
      window.setTimeout(() => {
        setFadeMs(FADE_OUT_MS);
        setOpacity(0);
      }, FADE_IN_MS + HOLD_MS),
    );
    timers.push(
      window.setTimeout(() => setVisible(false), FADE_IN_MS + HOLD_MS + FADE_OUT_MS),
    );
    return () => {
      window.cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
      style={{
        opacity,
        transition: `opacity ${fadeMs}ms ease-in-out`,
        backgroundColor: "#000000",
      }}
    >
      <img
        src="/icons/splash-logo.png"
        alt=""
        className="w-[88%] max-w-[900px] select-none"
        draggable={false}
      />
    </div>
  );
}
