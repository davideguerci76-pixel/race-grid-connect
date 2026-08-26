import { useEffect, useState } from "react";
import { IUBENDA, IUBENDA_ENABLED, IUB_PURPOSE } from "@/config/iubenda";

declare global {
  interface Window {
    _iub?: any;
  }
}

/** Opens the iubenda cookie preferences panel. */
export function openCookiePreferences() {
  if (typeof window === "undefined") return;
  try {
    window._iub?.cs?.api?.openPreferences?.();
  } catch {
    /* ignore */
  }
}

function readPurposeConsent(purpose: number): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cs = window._iub?.cs;
    if (!cs) return false;
    const consent = cs.consent;
    if (consent?.purposes && typeof consent.purposes === "object") {
      return consent.purposes[String(purpose)] === true || consent.purposes[purpose] === true;
    }
    return cs.api?.isConsentGiven?.() === true;
  } catch {
    return false;
  }
}

/**
 * Reactive per-purpose consent state.
 * When iubenda is not configured yet, consent is treated as NOT given, so
 * third-party embeds stay blocked by default (privacy-by-default).
 */
export function useIubendaConsent(purpose: number = IUB_PURPOSE.experience) {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!IUBENDA_ENABLED) return;
    const sync = () => setGranted(readPurposeConsent(purpose));
    sync();
    const id = window.setInterval(sync, 1000);
    window.addEventListener("iubenda-consent-given", sync);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("iubenda-consent-given", sync);
    };
  }, [purpose]);

  return granted;
}

/** Grants a single purpose from an in-page "activate this content" button. */
export function grantPurpose(purpose: number) {
  if (typeof window === "undefined") return;
  try {
    const api = window._iub?.cs?.api;
    if (api?.consentGiven) api.consentGiven({ purposes: { [purpose]: true } });
    else api?.openPreferences?.();
    window.dispatchEvent(new Event("iubenda-consent-given"));
  } catch {
    /* ignore */
  }
}

export function iubendaConfig(lang: string) {
  return {
    siteId: Number(IUBENDA.siteId),
    cookiePolicyId: Number(IUBENDA.cookiePolicyId),
    lang,
    storage: { useSiteId: true },
    perPurposeConsent: true,
    consentOnContinuedBrowsing: false,
    invalidateConsentWithoutLog: true,
    banner: {
      acceptButtonDisplay: true,
      customizeButtonDisplay: true,
      rejectButtonDisplay: true,
      closeButtonRejects: true,
      explicitWithdrawal: true,
      listPurposes: true,
      position: "float-bottom-center",
      backgroundOverlay: true,
      acceptButtonCaptionColor: "#ffffff",
      acceptButtonColor: "#e10600",
      customizeButtonCaptionColor: "#ffffff",
      customizeButtonColor: "#2a2d35",
      rejectButtonCaptionColor: "#ffffff",
      rejectButtonColor: "#2a2d35",
      backgroundColor: "#12141a",
      textColor: "#ffffff",
      fontSize: "13px",
    },
  };
}

export { IUB_PURPOSE };
