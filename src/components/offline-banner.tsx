import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Persistent connection state for the installed app. Purely a UX warning:
 * never logged to `client_error_log`.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] bg-amber-500 px-4 py-2 text-center text-xs font-bold uppercase tracking-widest text-black">
      {t("errors.offlineBanner")}
    </div>
  );
}
