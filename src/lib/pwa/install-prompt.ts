/**
 * Captures the Android/Chromium `beforeinstallprompt` event as early as
 * possible (the browser fires it once, very soon after load) so any component
 * mounted later can still offer a real install button.
 */

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallResult = "accepted" | "dismissed" | "unavailable";

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
  return () => {
    listeners.delete(cb);
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "__timeout__"> {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve("__timeout__");
      }
    }, ms);
    p.then(
      (v) => {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(v);
        }
      },
      () => {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve("__timeout__");
        }
      },
    );
  });
}

/**
 * Triggers the native install dialog.
 *
 * `prompt()` is invoked synchronously inside the user gesture (no awaited work
 * before it) so Chrome keeps the user-activation requirement satisfied.
 * Both `prompt()` and `userChoice` are guarded by timeouts: some Chrome states
 * never settle those promises, which previously left the UI stuck in loading.
 */
export async function promptInstall(): Promise<InstallResult> {
  const evt = deferred;
  if (!evt) return "unavailable";

  let promptCall: Promise<void> | undefined;
  try {
    // Must run in the same task as the click — do not await anything before it.
    promptCall = evt.prompt();
  } catch {
    deferred = null;
    emit();
    return "unavailable";
  }

  // If the dialog cannot be shown, prompt() never settles: bail out after 3s.
  if (promptCall && typeof promptCall.then === "function") {
    const shown = await withTimeout(promptCall, 3000);
    if (shown === "__timeout__") {
      deferred = null;
      emit();
      return "unavailable";
    }
  }

  // The dialog is open: wait for the choice, but never forever.
  const choice = await withTimeout(evt.userChoice, 120_000);
  deferred = null;
  emit();
  if (choice === "__timeout__") return "unavailable";
  return choice.outcome === "accepted" ? "accepted" : "dismissed";
}
