import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Share } from "lucide-react";
import { useInstallApp } from "@/hooks/use-install-app";

/**
 * Primary "Install Pit Call" CTA shown on the dashboard.
 * Hidden entirely when the app already runs standalone.
 */
export function InstallAppCard() {
  const { t } = useTranslation();
  const { mode, busy, failed, install } = useInstallApp();
  const [open, setOpen] = useState(false);

  // When the native prompt can't be shown, fall back to manual instructions.
  useEffect(() => {
    if (failed) setOpen(true);
  }, [failed]);

  if (mode === "hidden") return null;

  const isNative = mode === "prompt";
  const title = mode === "ios" ? t("sweep_profile.pwa.title_ios") : t("sweep_profile.pwa.title");

  return (
    <div className="mt-6 border border-racing-red bg-racing-red/10">
      <div className="border-b border-racing-red/40 px-4 py-2">
        <span className="label-mono text-racing-red">[INSTALL]</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0 max-w-xl">
          <div className="font-black uppercase italic tracking-tight">{title}</div>
          <p className="mt-1 text-sm text-muted-foreground">{t("sweep_profile.pwa.desc")}</p>

          {failed && <p className="mt-2 text-sm font-bold text-racing-red">{t("sweep_profile.pwa.failed")}</p>}

          {open && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {(mode === "ios"
                ? [t("sweep_profile.pwa.ios_1"), t("sweep_profile.pwa.ios_2"), t("sweep_profile.pwa.ios_3")]
                : [t("sweep_profile.pwa.manual_1"), t("sweep_profile.pwa.manual_2"), t("sweep_profile.pwa.manual_3")]
              ).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
        </div>

        <button
          disabled={busy}
          onClick={() => {
            // Called synchronously from the click so prompt() keeps user activation.
            if (isNative) void install();
            else setOpen((v) => !v);
          }}
          className="inline-flex items-center gap-2 border border-racing-red bg-racing-red px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-50"
        >
          {isNative ? <Download className="size-4" /> : <Share className="size-4" />}
          {isNative
            ? t("sweep_profile.pwa.install_btn")
            : mode === "ios"
              ? t("sweep_profile.pwa.ios_btn")
              : t("sweep_profile.pwa.how_btn")}
        </button>
      </div>
    </div>
  );
}
