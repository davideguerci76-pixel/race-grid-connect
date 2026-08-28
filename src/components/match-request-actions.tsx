import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { confirmDialog } from "@/hooks/use-confirm";
import { toastError } from "@/lib/errors";
import { confirmEngagement, declineMatchConfirmation, extendMatchConfirmation } from "@/lib/paddock.functions";

const MAX_EXTENSIONS = 5;

export function expiryInfo(expiresAt: string | null | undefined) {
  if (!expiresAt) return { msLeft: null as number | null, expired: false };
  const msLeft = new Date(expiresAt).getTime() - Date.now();
  return { msLeft, expired: msLeft <= 0 };
}

/** Countdown label for a pending match request. */
export function MatchRequestDeadline({ expiresAt }: { expiresAt: string | null | undefined }) {
  const { t } = useTranslation();
  const { msLeft, expired } = expiryInfo(expiresAt);
  if (msLeft === null) return null;
  if (expired) {
    return (
      <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-racing-red">
        {t("engagements.request_expired")}
      </div>
    );
  }
  const hours = Math.floor(msLeft / 3600000);
  const label = hours >= 1
    ? t("engagements.expires_in_hours", { count: hours })
    : t("engagements.expires_in_minutes", { count: Math.max(1, Math.round(msLeft / 60000)) });
  return (
    <div className={`mt-2 font-mono text-[10px] uppercase tracking-widest ${hours < 12 ? "text-racing-red" : "text-racing-yellow"}`}>
      {label}
    </div>
  );
}

/**
 * Freelancer actions on a pending match request: confirm, ask more time, decline.
 * Business rules (48h deadline, max 5 extensions, never past the Pit Call start)
 * are enforced server-side; this only mirrors them in the UI.
 */
export function MatchRequestActions({
  engagementId,
  expiresAt,
  extensionCount = 0,
  pitcallStart,
}: {
  engagementId: string;
  expiresAt?: string | null;
  extensionCount?: number;
  pitcallStart?: string | null;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const confirmFn = useServerFn(confirmEngagement);
  const declineFn = useServerFn(declineMatchConfirmation);
  const extendFn = useServerFn(extendMatchConfirmation);

  const { msLeft, expired } = expiryInfo(expiresAt);

  const confirmMut = useMutation({
    mutationFn: () => confirmFn({ data: { id: engagementId } }),
    onSuccess: () => { toast.success(t("engagements.confirmed_toast")); qc.invalidateQueries(); },
    onError: (e) => toastError(e, "sweep_engage.common.failed"),
  });
  const declineMut = useMutation({
    mutationFn: () => declineFn({ data: { id: engagementId } }),
    onSuccess: () => { toast.success(t("engagements.declined_toast")); qc.invalidateQueries(); },
    onError: (e) => toastError(e, "sweep_engage.common.failed"),
  });
  const extendMut = useMutation({
    mutationFn: () => extendFn({ data: { id: engagementId } }),
    onSuccess: () => { toast.success(t("engagements.more_time_toast")); qc.invalidateQueries(); },
    onError: (e) => toastError(e, "sweep_engage.common.failed"),
  });

  if (expired) {
    return (
      <span className="inline-flex items-center justify-center border border-border bg-secondary/60 px-3 py-2 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("engagements.request_expired")}
      </span>
    );
  }

  const startTs = pitcallStart ? new Date(`${pitcallStart}T00:00:00Z`).getTime() : null;
  const expiryTs = expiresAt ? new Date(expiresAt).getTime() : null;
  const canExtend =
    expiryTs !== null &&
    msLeft !== null &&
    msLeft <= 12 * 3600000 &&
    extensionCount < MAX_EXTENSIONS &&
    (startTs === null || startTs > expiryTs);

  const busy = confirmMut.isPending || declineMut.isPending || extendMut.isPending;

  return (
    <>
      <button
        onClick={async () => { if (await confirmDialog(t("sweep_engage.matches.confirm_match_prompt"))) confirmMut.mutate(); }}
        disabled={busy}
        className="bg-racing-red px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
      >
        {t("engagements.confirm")}
      </button>
      <button
        onClick={() => extendMut.mutate()}
        disabled={busy || !canExtend}
        title={!canExtend ? t("engagements.ask_more_time_hint") : undefined}
        className="border border-border px-4 py-2 text-[11px] font-bold uppercase tracking-widest hover:bg-secondary disabled:opacity-40"
      >
        {t("engagements.ask_more_time")}
      </button>
      <button
        onClick={async () => { if (await confirmDialog(t("engagements.decline_confirm"))) declineMut.mutate(); }}
        disabled={busy}
        className="border border-racing-red px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-racing-red hover:bg-racing-red/10 disabled:opacity-60"
      >
        {t("engagements.decline")}
      </button>
    </>
  );
}
