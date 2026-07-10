import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import it from "./locales/it.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";

export const SUPPORTED_LANGS = [
  { code: "en", label: "EN" },
  { code: "it", label: "IT" },
  { code: "es", label: "ES" },
  { code: "fr", label: "FR" },
  { code: "de", label: "DE" },
] as const;

export const LANG_STORAGE_KEY = "paddockpro.lang";

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        it: { translation: it },
        es: { translation: es },
        fr: { translation: fr },
        de: { translation: de },
      },
      lng: "en",
      fallbackLng: "en",
      supportedLngs: SUPPORTED_LANGS.map((l) => l.code),
      interpolation: { escapeValue: false },
    });
}

// Language must only change after the initial SSR hydration/paint completes,
// otherwise SSR (always 'en') and client-rendered route text can diverge.
export function applySavedLanguage() {
  if (typeof window === "undefined") return;
  let cancelled = false;

  const run = () => {
    if (cancelled) return;
    try {
      const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
      if (saved && saved !== i18n.language && SUPPORTED_LANGS.some((l) => l.code === saved)) {
        void i18n.changeLanguage(saved);
        document.documentElement.lang = saved;
      }
    } catch { /* ignore */ }
  };

  const schedule = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(run, 0);
      });
    });
  };

  try {
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
  } catch { /* ignore */ }

  return () => {
    cancelled = true;
    window.removeEventListener("load", schedule);
  };
}

export default i18n;
