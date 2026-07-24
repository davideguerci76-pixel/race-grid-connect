import { useTranslation } from "react-i18next";
import { useHydrated } from "@tanstack/react-router";
import { SUPPORTED_LANGS, LANG_STORAGE_KEY } from "@/i18n";
import { Globe } from "lucide-react";
import { useState } from "react";

export function LanguageSwitcher({ align = "right" }: { align?: "left" | "right" }) {
  const { i18n } = useTranslation();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const currentCode = hydrated ? i18n.resolvedLanguage : "en";
  const current = SUPPORTED_LANGS.find((l) => l.code === currentCode) ?? SUPPORTED_LANGS[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 border border-border px-2.5 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors hover:bg-secondary"
      >
        <Globe className="size-3.5" />
        {current.label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute top-full z-50 mt-1 min-w-[100px] border border-border bg-card shadow-lg ${align === "left" ? "left-0" : "right-0"}`}>
            {SUPPORTED_LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => { void i18n.changeLanguage(l.code); try { window.localStorage.setItem(LANG_STORAGE_KEY, l.code); } catch { /* ignore */ } setOpen(false); }}
                className={`block w-full px-3 py-2 text-left text-xs font-bold uppercase tracking-widest transition-colors hover:bg-secondary ${l.code === current.code ? "text-racing-red" : ""}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
