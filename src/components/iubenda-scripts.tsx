import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { IUBENDA, IUBENDA_ENABLED } from "@/config/iubenda";
import { iubendaConfig } from "@/lib/iubenda";

const LANG_MAP: Record<string, string> = {
  en: "en",
  it: "it",
  es: "es",
  fr: "fr",
  de: "de",
};

/**
 * Loads the iubenda Cookie Solution with auto-blocking enabled.
 * Auto-blocking prevents any third-party resource (maps, embeds) from being
 * requested before the user consents.
 */
export function IubendaScripts() {
  const { i18n } = useTranslation();

  useEffect(() => {
    if (!IUBENDA_ENABLED) return;
    if (typeof window === "undefined") return;
    if (document.getElementById("iub-cs")) return;

    const lang = LANG_MAP[i18n.language?.slice(0, 2) ?? "en"] ?? "en";
    window._iub = window._iub || {};
    window._iub.csConfiguration = iubendaConfig(lang);

    const add = (src: string, id: string, async = false) => {
      const s = document.createElement("script");
      s.id = id;
      s.src = src;
      s.type = "text/javascript";
      s.charset = "UTF-8";
      if (async) s.async = true;
      document.head.appendChild(s);
    };

    add(`https://cs.iubenda.com/autoblocking/${IUBENDA.siteId}.js`, "iub-autoblock");
    add("//cdn.iubenda.com/cs/gpp/stub.js", "iub-gpp");
    add("//cdn.iubenda.com/cs/iubenda_cs.js", "iub-cs", true);
  }, [i18n.language]);

  return null;
}
