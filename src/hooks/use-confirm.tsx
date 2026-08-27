import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  /** Already localized title; falls back to the branded default. */
  title?: string;
  /** Already localized body copy. */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Request = ConfirmOptions & { resolve: (value: boolean) => void };

let openRequest: ((request: Request) => void) | null = null;
const pending: Request[] = [];

/**
 * Branded async replacement for window.confirm().
 * Usable from anywhere (event handlers, mutations) — no hook required.
 */
export function confirmDialog(
  description: string,
  options: ConfirmOptions = {},
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const request: Request = { description, ...options, resolve };
    if (openRequest) openRequest(request);
    else pending.push(request);
  });
}

/** Hook form for components that prefer an injected function. */
export function useConfirm() {
  return useCallback(confirmDialog, []);
}

/** Mounted once in the root: renders every confirmDialog() request. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [request, setRequest] = useState<Request | null>(null);
  const active = useRef<Request | null>(null);

  useEffect(() => {
    openRequest = (next) => {
      active.current = next;
      setRequest(next);
    };
    while (pending.length) openRequest(pending.shift()!);
    return () => {
      openRequest = null;
    };
  }, []);

  const settle = (value: boolean) => {
    active.current?.resolve(value);
    active.current = null;
    setRequest(null);
  };

  return (
    <>
      {children}
      <AlertDialog open={request !== null} onOpenChange={(next) => { if (!next) settle(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase tracking-tight">
              {request?.title ?? t("confirm.defaultTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {request?.description ?? t("confirm.defaultDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {request?.cancelLabel ?? t("confirm.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={request?.destructive ? "bg-racing-red text-white hover:brightness-110" : undefined}
            >
              {request?.confirmLabel ?? t("confirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
