import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Light-blue badge marking a freelancer already part of the team's pool. */
export function PoolBadge({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center gap-1 border border-sky-400/60 bg-sky-400/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-sky-300 ${className}`}
    >
      <Users className="size-3" /> {t("pool.badge")}
    </span>
  );
}
