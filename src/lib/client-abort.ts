// The client closing the socket mid-render (reload, navigation, preview iframe
// swap) surfaces as an "aborted"/ECONNRESET throw. That is not an app error and
// must not render the 500 error page.
export function isClientAbort(error: unknown): boolean {
  const seen = new Set<unknown>();
  let cur: unknown = error;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown };
    if (e.code === "ECONNRESET" || e.code === "ABORT_ERR") return true;
    if (e.name === "AbortError") return true;
    if (typeof e.message === "string" && /^aborted$/i.test(e.message)) return true;
    cur = e.cause;
  }
  return false;
}
