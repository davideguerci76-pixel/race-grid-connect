import { useEffect, useState } from "react";
import {
  IUBENDA,
  IUBENDA_ENABLED,
  IUBENDA_PRECONFIG,
  IUBENDA_SCRIPT_URL,
  IUB_PURPOSE,
} from "@/config/iubenda";

let iubendaLoading = false;

/**
 * Loads the iubenda unified embed client-side, AFTER React hydration.
 * Injecting it from the SSR <head> made iubenda append the banner to <body>
 * before hydration finished; React then cleared the body to recover from the
 * resulting mismatch and the banner disappeared. Post-hydration injection
 * avoids that entirely. Guarded so it can never initialize twice.
 */
export function loadIubenda() {
  if (typeof window === "undefined" || !IUBENDA_ENABLED || iubendaLoading) return;
  if (document.querySelector(`script[src="${IUBENDA_SCRIPT_URL}"]`)) return;
  iubendaLoading = true;
  const pre = document.createElement("script");
  pre.type = "text/javascript";
  pre.text = IUBENDA_PRECONFIG;
  const main = document.createElement("script");
  main.type = "text/javascript";
  main.src = IUBENDA_SCRIPT_URL;
  document.head.appendChild(pre);
  document.head.appendChild(main);
}

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

/**
 * Opens the US State Laws preferences panel ("Your Privacy Choices").
 * Same API the iubenda-injected badge calls; falls back to the standard
 * preferences panel when the US widget is not active for the visitor.
 */
export function openPrivacyChoices() {
  if (typeof window === "undefined") return;
  try {
    const api = window._iub?.cs?.api;
    if (api?.openUspPreferences) api.openUspPreferences();
    else if (api?.openUSPreferences) api.openUSPreferences();
    else api?.openPreferences?.();
  } catch {
    /* ignore */
  }
}

const NOTICE_SELECTOR = "a.iubenda-cs-uspr-link, .iub__us-widget__link:not(.iubenda-cs-preferences-link)";
const WIDGET_SELECTOR = ".iub__us-widget, .iub__us-widget__wrapper, button.iubenda-tp-btn, .iubenda-tp-btn";

let noticeHref: string | null = null;

/**
 * Removes the auto-injected iubenda overlays (US widget tabs + floating
 * preferences button) from the DOM and captures the "Notice at collection"
 * URL so the footer can expose the very same destination as a plain link.
 * The functions themselves stay available through the footer links.
 */
export function useIubendaFooterLinks() {
  const [notice, setNotice] = useState<string | null>(noticeHref);
  const [usWidget, setUsWidget] = useState(false);

  useEffect(() => {
    if (!IUBENDA_ENABLED) return;
    const sweep = () => {
      const anchor = document.querySelector<HTMLAnchorElement>(NOTICE_SELECTOR);
      if (anchor) {
        setUsWidget(true);
        const href = anchor.getAttribute("href");
        if (href && href !== "#") {
          noticeHref = new URL(href, window.location.href).toString();
          setNotice(noticeHref);
        }
      }
      document.querySelectorAll(WIDGET_SELECTOR).forEach((el) => el.remove());
    };
    sweep();
    const observer = new MutationObserver(sweep);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return { noticeUrl: notice, hasUsWidget: usWidget };
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

/* Banner configuration lives in the iubenda dashboard and ships with the
   unified embedding script — no local csConfiguration object. */


export { IUB_PURPOSE };
