import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { usePushNotifications } from "@/hooks/use-push-notifications";

/**
 * Device-level enrolment card for Web Push. Shown on the notifications page.
 * Hidden entirely on browsers with no push support that also can't be
 * installed (nothing actionable to offer there).
 */
export function PushSetupCard() {
  const { t } = useTranslation();
  const { state, subscribed, busy, enable, disable } = usePushNotifications();

  if (state === "unsupported") return null;

  const needsInstall = state === "needs-install";

  return (
    <div className="mt-6 border border-border bg-card">
      <div className="border-b border-border px-4 py-2">
        <span className="label-mono">[PUSH]</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0 max-w-xl">
          <div className="font-black uppercase italic tracking-tight">
            {needsInstall ? t("sweep_profile.push.install_title") : t("sweep_profile.push.title")}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {needsInstall
              ? t("sweep_profile.push.install_ios")
              : state === "denied"
                ? t("sweep_profile.push.denied")
                : subscribed
                  ? t("sweep_profile.push.enabled")
                  : t("sweep_profile.push.desc")}
          </p>
        </div>

        {!needsInstall && state !== "denied" && (
          <button
            disabled={busy}
            onClick={() => {
              if (subscribed) {
                void disable();
                return;
              }
              void enable().then((ok) => {
                if (!ok) toast.error(t("sweep_profile.push.failed"));
              });
            }}
            className={`border px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 ${
              subscribed ? "border-border hover:bg-secondary" : "border-racing-red bg-racing-red text-white hover:opacity-90"
            }`}
          >
            {subscribed ? t("sweep_profile.push.disable") : t("sweep_profile.push.enable")}
          </button>
        )}
      </div>
    </div>
  );
}
