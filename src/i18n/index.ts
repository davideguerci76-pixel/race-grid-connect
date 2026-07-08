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

// After hydration, switch to user's saved language client-side only.
if (typeof window !== "undefined") {
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && saved !== i18n.language && SUPPORTED_LANGS.some((l) => l.code === saved)) {
      // Defer to next tick so initial hydration matches SSR ('en').
      setTimeout(() => { void i18n.changeLanguage(saved); }, 0);
    }
  } catch { /* ignore */ }
}

export default i18n;
