import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

type Props = {
  /** Big display code: 404, 403, "RED FLAG"… */
  code: string;
  titleKey: string;
  bodyKey: string;
  referenceId?: string;
  onRetry?: () => void;
};

/**
 * Shared PITCALL error surface: crashes, 404, 403 and offline states all use
 * this screen so system feedback always looks native to the platform.
 */
export function PitcallErrorScreen({ code, titleKey, bodyKey, referenceId, onRetry }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <p className="font-mono text-6xl font-black leading-none text-racing-red">{code}</p>
        <h1 className="mt-4 text-xl font-bold uppercase tracking-tight">{t(titleKey)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t(bodyKey)}</p>

        {referenceId ? (
          <p className="mt-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {t("errors.reference")}: <span className="text-foreground">{referenceId}</span>
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="bg-racing-red px-5 py-3 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:brightness-110"
            >
              {t("errors.actions.retry")}
            </button>
          ) : null}
          <Link
            to="/"
            className="border border-border px-5 py-3 text-xs font-bold uppercase tracking-widest hover:bg-secondary"
          >
            {t("errors.actions.home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
