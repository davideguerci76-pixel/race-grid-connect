import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

type IdentityPrivacyReassuranceProps = {
  audience: "freelancer" | "team";
  context: "signup" | "profile";
};

export function IdentityPrivacyReassurance({ audience, context }: IdentityPrivacyReassuranceProps) {
  const { t } = useTranslation();
  const bodyKey = `identity_privacy.${context}_${audience}_body`;

  return (
    <aside
      className="flex min-w-0 items-start gap-3 border border-racing-red/35 bg-racing-red/5 p-3"
      data-testid={`identity-privacy-${context}-${audience}`}
    >
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-racing-red" aria-hidden="true" />
      <div className="min-w-0">
        <h3 className="text-xs font-bold text-foreground">{t("identity_privacy.title")}</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t(bodyKey)}</p>
      </div>
    </aside>
  );
}