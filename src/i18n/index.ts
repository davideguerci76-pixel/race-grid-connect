import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const SUPPORTED_LANGS = [
  { code: "en", label: "EN" },
  { code: "it", label: "IT" },
  { code: "es", label: "ES" },
  { code: "fr", label: "FR" },
  { code: "de", label: "DE" },
] as const;

export const LANG_STORAGE_KEY = "pitcall.lang";

type Dict = Record<string, unknown>;

function deepMerge(target: Dict, source: Dict): Dict {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const existing = target[k];
      target[k] = deepMerge(
        existing && typeof existing === "object" && !Array.isArray(existing) ? ({ ...(existing as Dict) }) : {},
        v as Dict,
      );
    } else {
      target[k] = v;
    }
  }
  return target;
}

// Every JSON bundle in ./locales is merged by language prefix, so translation
// files can be split per feature (e.g. en.json + en.profile.json).
const bundles = import.meta.glob("./locales/*.json", { eager: true }) as Record<string, { default: Dict }>;

const resources: Record<string, { translation: Dict }> = {};
for (const lang of SUPPORTED_LANGS) {
  resources[lang.code] = { translation: {} };
}
for (const [path, mod] of Object.entries(bundles)) {
  const file = path.split("/").pop() ?? "";
  const code = file.split(".")[0];
  if (!resources[code]) continue;
  deepMerge(resources[code].translation, mod.default ?? {});
}

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: "en",
      fallbackLng: "en",
      supportedLngs: SUPPORTED_LANGS.map((l) => l.code),
      interpolation: { escapeValue: false },
    });
} else if (i18n.language !== "en") {
  void i18n.changeLanguage("en");
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
