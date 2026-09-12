import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle, Flag, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useActivationStatus, type ActivationReason } from "@/hooks/use-activation-status";

type Step = { key: "role" | "phone" | "availability"; done: boolean; reason?: ActivationReason };

const dismissKey = (uid: string) => `pitcall.ready_dismissed.${uid}`;

/** Deep-link target for the first missing requirement (role → phone → availability). */
function targetFor(step: Step): { to: string; search?: Record<string, string> } {
  if (step.key === "role") return { to: "/dashboard/profile", search: { focus: "role" } };
  if (step.key === "phone") return { to: "/dashboard/profile", search: { focus: "phone" } };
  return { to: "/dashboard/calendar" };
}

/**
 * Freelancer activation card. Status is derived from the DB on every mount;
 * localStorage only remembers the dismiss of the positive READY confirmation.
 */
export function ActivationCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data } = useActivationStatus();
  const [dismissed, setDismissed] = useState(false);

  const ready = data?.ready === true;
  const uid = user?.id;

  useEffect(() => {
    if (!uid || !data?.is_freelancer) return;
    if (!ready) {
      // Lost READY (or never reached it): forget any previous dismiss so the next READY shows again.
      window.localStorage.removeItem(dismissKey(uid));
      setDismissed(false);
      return;
    }
    setDismissed(window.localStorage.getItem(dismissKey(uid)) === "1");
  }, [uid, ready, data?.is_freelancer]);

  if (!data?.is_freelancer) return null;

  if (ready) {
    if (dismissed) return null;
    return (
      <div className="mt-6 flex items-start justify-between gap-3 border border-[#16a34a]/50 bg-[#16a34a]/10 p-4" data-testid="activation-ready">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-[#16a34a]">
            <CheckCircle2 className="size-4" /> {t("activation.ready_title")}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("activation.ready_body")}</p>
        </div>
        <button
          type="button"
          aria-label={t("activation.dismiss")}
          onClick={() => {
            if (uid) window.localStorage.setItem(dismissKey(uid), "1");
            setDismissed(true);
          }}
          className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const reasons = new Set(data.reasons ?? []);
  const availReason: ActivationReason | undefined = reasons.has("stale_availability")
    ? "stale_availability"
    : reasons.has("missing_availability")
      ? "missing_availability"
      : undefined;
  const steps: Step[] = [
    { key: "role", done: !reasons.has("missing_role"), reason: "missing_role" },
    { key: "phone", done: !reasons.has("missing_phone"), reason: "missing_phone" },
    { key: "availability", done: !availReason, reason: availReason },
  ];
  const next = steps.find((s) => !s.done) ?? steps[0];
  const target = targetFor(next);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="mt-6 border border-racing-yellow bg-racing-yellow/10 p-5" data-testid="activation-card">
      <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-racing-yellow">
        <Flag className="size-4" /> {t("activation.not_ready_label")} · {doneCount}/3
      </div>
      <h2 className="mt-1 text-2xl font-black uppercase italic tracking-tighter">{t("activation.title")}</h2>
      <ul className="mt-4 space-y-2">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-2 text-sm" data-testid={`activation-step-${s.key}`} data-done={s.done}>
            {s.done ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#16a34a]" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-racing-yellow" />
            )}
            <div className="min-w-0">
              <div className={s.done ? "text-muted-foreground line-through" : "font-bold"}>
                {t(`activation.step_${s.key}`)}
              </div>
              {!s.done && s.reason && (
                <div className="text-xs text-muted-foreground">{t(`activation.reason_${s.reason}`)}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">
        {availReason ? t("activation.invisible_hint") : t("activation.why")}
      </p>
      <Link
        to={target.to}
        search={target.search as any}
        className="mt-4 inline-block bg-racing-red px-5 py-3 font-mono text-xs font-black uppercase tracking-widest text-white hover:brightness-110"
        data-testid="activation-cta"
      >
        {t(`activation.cta_${next.key}`)}
      </Link>
    </div>
  );
}
