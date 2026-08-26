import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IUB_PURPOSE, grantPurpose, openCookiePreferences, useIubendaConsent } from "@/lib/iubenda";

/**
 * Blocks third-party embeds (map tiles, external content) until the user has
 * consented to the matching iubenda purpose. Required by ePrivacy/GDPR because
 * loading the resource discloses the visitor IP to a third party.
 */
export function ConsentGate({
  purpose = IUB_PURPOSE.experience,
  title,
  description,
  provider,
  className,
  children,
}: {
  purpose?: number;
  title?: string;
  description?: string;
  provider: string;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const granted = useIubendaConsent(purpose);

  if (granted) return <>{children}</>;

  return (
    <div className={className ?? "flex h-[420px] w-full flex-col items-center justify-center gap-3 border border-border bg-carbon px-6 text-center"}>
      <div className="label-mono">[{t("consent.blocked_label", { defaultValue: "EXTERNAL CONTENT" })}]</div>
      <div className="text-lg font-black uppercase italic tracking-tighter">
        {title ?? t("consent.blocked_title", { defaultValue: "Content blocked for your privacy" })}
      </div>
      <p className="max-w-md text-sm text-muted-foreground">
        {description ??
          t("consent.blocked_desc", {
            defaultValue:
              "This content is served by {{provider}}. Loading it shares your IP address with that provider, so we ask for your consent first.",
            provider,
          })}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => grantPurpose(purpose)}
          className="bg-racing-red px-5 py-3 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:brightness-110"
        >
          {t("consent.enable", { defaultValue: "Enable content" })}
        </button>
        <button
          type="button"
          onClick={openCookiePreferences}
          className="border border-border px-5 py-3 text-xs font-bold uppercase tracking-widest transition-colors hover:bg-secondary"
        >
          {t("consent.preferences", { defaultValue: "Cookie preferences" })}
        </button>
      </div>
    </div>
  );
}
