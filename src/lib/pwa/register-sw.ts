/**
 * Single guarded registration point for the Pit Call service worker.
 * Never registers in dev, in the Lovable preview, inside an iframe, or with
 * `?sw=off` — in those contexts any existing registration is removed instead.
 */

const SW_URL = "/sw.js";

function isBlockedHost(hostname: string): boolean {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

export function shouldRegisterServiceWorker(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!import.meta.env.PROD) return false;
  if (window.top !== window.self) return false;
  if (isBlockedHost(window.location.hostname)) return false;
  if (new URLSearchParams(window.location.search).has("sw") && new URLSearchParams(window.location.search).get("sw") === "off") return false;
  return true;
}

async function unregisterAppWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      regs
        .filter((r) => (r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "").endsWith(SW_URL))
        .map((r) => r.unregister()),
    );
  } catch {
    /* ignore */
  }
}

/** Registers the worker when allowed; cleans up stale ones otherwise. */
export function registerServiceWorker(onNavigate?: (url: string) => void) {
  if (typeof window === "undefined") return;

  if (onNavigate && "serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event.data as { type?: string; url?: string } | undefined;
      if (data?.type === "PITCALL_NAVIGATE" && data.url) onNavigate(data.url);
    });
  }

  if (!shouldRegisterServiceWorker()) {
    void unregisterAppWorker();
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => undefined);
  });
}

/** True when the app runs as an installed standalone app. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
