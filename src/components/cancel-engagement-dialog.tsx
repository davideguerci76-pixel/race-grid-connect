import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export type CancelDialogResult = { reason: string | null; privateNote: string | null };

/**
 * CANCEL-UX-01 — branded replacement for the old window.prompt("Reason").
 * Collects two OPTIONAL and semantically distinct texts:
 *  - message to the other party (counterparty-visible),
 *  - private cancellation note (author-only, stored in a separate RLS-protected table).
 * It carries no cancellation authority: the server decides grace/kind/actor.
 *
 * CANCEL-UX-02 — the draft is keyed on `engagementId` ONLY. Any re-render, refetch,
 * query invalidation or tab-visibility refetch keeps the typed text intact; the draft
 * is reset only when the dialog is intentionally dismissed (id -> null) or a different
 * engagement is opened. A failed submit leaves the dialog open with both texts.
 */
export function CancelEngagementDialog({
  engagementId,
  warning,
  pending,
  onCancel,
  onConfirm,
}: {
  engagementId: string | null;
  warning: string | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (result: CancelDialogResult) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    // Intentionally depends on the engagement id alone: object identity of the
    // parent props must never wipe an in-progress draft.
    setReason("");
    setNote("");
  }, [engagementId]);


  return (
    <Dialog open={request !== null} onOpenChange={(next) => { if (!next && !pending) onCancel(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="cancel-engagement-dialog">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-tight">{t("cancel_ux.title")}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">{request?.warning}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="cancel-public-message" className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {t("cancel_ux.public_label")}
            </label>
            <Textarea
              id="cancel-public-message"
              value={reason}
              maxLength={500}
              rows={3}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("cancel_ux.public_placeholder")}
            />
            <p className="text-[11.5px] text-muted-foreground">{t("cancel_ux.public_helper")}</p>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="cancel-private-note" className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {t("cancel_ux.private_label")}
            </label>
            <Textarea
              id="cancel-private-note"
              value={note}
              maxLength={500}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("cancel_ux.private_placeholder")}
            />
            <p className="text-[11.5px] text-muted-foreground">{t("cancel_ux.private_helper")}</p>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="border border-border px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-muted"
          >
            {t("cancel_ux.keep")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm({ reason: reason.trim() || null, privateNote: note.trim() || null })}
            className="bg-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
          >
            {t("cancel_ux.confirm")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
