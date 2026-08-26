import { useEffect } from "react";
import { IUBENDA_ENABLED, IUBENDA_SCRIPT_URL } from "@/config/iubenda";

const SCRIPT_ID = "iubenda-unified-embed";

/**
 * Loads the iubenda unified embedding script (cookie banner + auto-blocking +
 * policy widgets). The script is injected into <head> once, client-side only,
 * and is idempotent across client navigations and HMR.
 */
export function IubendaScripts() {
  useEffect(() => {
    if (!IUBENDA_ENABLED) return;
    if (typeof document === "undefined") return;
    if (document.getElementById(SCRIPT_ID)) return;

    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.type = "text/javascript";
    s.src = IUBENDA_SCRIPT_URL;
    s.async = true;
    document.head.appendChild(s);
  }, []);

  return null;
}
