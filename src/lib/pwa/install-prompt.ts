/**
 * Captures the Android/Chromium `beforeinstallprompt` event as early as
 * possible (the browser fires it once, very soon after load) so any component
 * mounted later can still offer a real install button.
 */

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function initInstallPromptCapture() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __pitcallInstallInit?: boolean };
  if (w.__pitcallInstallInit) return;
  w.__pitcallInstallInit = true;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export function getDeferredPrompt() {
  return deferred;
}

export function wasInstalled() {
  return installed;
}

export function subscribeInstallPrompt(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Triggers the native install dialog. Returns true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const evt = deferred;
  if (!evt) return false;
  try {
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    deferred = null;
    emit();
    return outcome === "accepted";
  } catch {
    return false;
  }
}
