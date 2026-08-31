// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.
import { isClientAbort } from "./client-abort";

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => {
    const error = (event as ErrorEvent).error ?? event;
    // Socket closed by the client mid-request (reload / preview iframe swap):
    // Node emits it as a global "aborted" error. Not an app error.
    if (isClientAbort(error)) {
      event.preventDefault?.();
      return;
    }
    record(error);
  });
  globalThis.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    if (isClientAbort(reason)) {
      event.preventDefault?.();
      return;
    }
    record(reason);
  });
}

// Node/dev-server path: abortIncoming throws outside any fetch handler.
const proc = (globalThis as { process?: NodeJS.Process }).process;
if (proc && typeof proc.on === "function" && !(proc as unknown as { __pitcallAbortGuard?: boolean }).__pitcallAbortGuard) {
  (proc as unknown as { __pitcallAbortGuard?: boolean }).__pitcallAbortGuard = true;
  proc.on("uncaughtException", (error) => {
    if (isClientAbort(error)) return;
    record(error);
    console.error(error);
  });
  proc.on("unhandledRejection", (reason) => {
    if (isClientAbort(reason)) return;
    record(reason);
    console.error(reason);
  });
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
