import { Link } from "@tanstack/react-router";
import { usePlatformFlags } from "@/hooks/use-platform-flags";
import { useTranslation } from "react-i18next";
import logoCompact from "@/assets/pitcall-logo-clean.png.asset.json";
import { openCookiePreferences, openPrivacyChoices, useIubendaFooterLinks } from "@/lib/iubenda";
import { policyUrl } from "@/config/iubenda";

export function SiteFooter() {
  const { t } = useTranslation();
  const flags = usePlatformFlags();
  const { noticeUrl, hasUsWidget } = useIubendaFooterLinks();
  return (
    <footer className="mt-24 border-t border-border bg-carbon">
      <div className="container-page grid gap-10 py-16 md:grid-cols-4">
        <div className="md:col-span-2">
          <img src={logoCompact.url} alt="Pit Call" width={1933} height={274} className="h-10 w-auto object-contain mix-blend-screen" />
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        <div>
          <div className="label-mono mb-3">{t("footer.network")}</div>
          <ul className="space-y-2 text-sm">
            <li>
              <Link to="/about" className="text-muted-foreground transition-colors hover:text-racing-red">
                {t("nav.about")}
              </Link>
            </li>
            <li>
              <Link to="/contact" className="text-muted-foreground transition-colors hover:text-racing-red">
                {t("nav.contact")}
              </Link>
            </li>
            <li>
              <Link to="/faq" className="text-muted-foreground transition-colors hover:text-racing-red">
                {t("nav.faq")}
              </Link>
            </li>

            {flags.homeStats && (
            <li>
              <Link to="/market" className="text-muted-foreground transition-colors hover:text-racing-red">
                {t("nav.market")}
              </Link>
            </li>
            )}
          </ul>
        </div>
        <div>
          <div className="label-mono mb-3">{t("footer.legal")}</div>
          <ul className="space-y-2 text-sm">
            <li>
              <a
                href={policyUrl("privacy")}
                title="Privacy Policy"
                className="iubenda-black iubenda-noiframe iubenda-embed text-muted-foreground transition-colors hover:text-racing-red"
              >
                {t("footer.privacy")}
              </a>
            </li>
            <li>
              <Link to="/legal/$doc" params={{ doc: "terms" }} className="text-muted-foreground transition-colors hover:text-racing-red">
                {t("footer.terms")}
              </Link>
            </li>
            <li>
              <a
                href={policyUrl("cookie")}
                title="Cookie Policy"
                className="iubenda-black iubenda-noiframe iubenda-embed text-muted-foreground transition-colors hover:text-racing-red"
              >
                {t("footer.cookie")}
              </a>
            </li>
            <li>
              <Link to="/legal/info" className="text-muted-foreground transition-colors hover:text-racing-red">
                {t("footer.dataInfo")}
              </Link>
            </li>

            {hasUsWidget && noticeUrl && (
            <li>
              <a
                href={noticeUrl}
                target="_blank"
                rel="noreferrer noopener nofollow"
                className="text-muted-foreground transition-colors hover:text-racing-red"
              >
                {t("footer.noticeAtCollection")}
              </a>
            </li>
            )}

            {hasUsWidget && (
            <li>
              <button
                type="button"
                onClick={openPrivacyChoices}
                className="text-left text-muted-foreground transition-colors hover:text-racing-red"
              >
                {t("footer.privacyChoices")}
              </button>
            </li>
            )}

            <li>
              <button
                type="button"
                onClick={openCookiePreferences}
                className="iubenda-cs-preferences-link text-left text-muted-foreground transition-colors hover:text-racing-red"
              >
                {t("consent.preferences", { defaultValue: "Cookie preferences" })}
              </button>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container-page flex items-center justify-between py-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>© 2026 Pit Call</span>
          <span>Pit Call Code 44.029 / Z-1</span>
        </div>
      </div>
    </footer>
  );
}
