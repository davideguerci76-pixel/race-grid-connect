import { Link } from "@tanstack/react-router";
import { usePlatformFlags } from "@/hooks/use-platform-flags";
import { useTranslation } from "react-i18next";
import { Instagram, Linkedin } from "lucide-react";
import logoCompact from "@/assets/pitcall-logo-clean.png.asset.json";
import { openCookiePreferences, openPrivacyChoices, useIubendaFooterLinks } from "@/lib/iubenda";
import { policyUrl } from "@/config/iubenda";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.766.987.005-3.772-.24-.375A9.86 9.86 0 011.89 11.3C1.89 5.74 6.451 1.18 12.01 1.18c2.67 0 5.18 1.04 7.07 2.929a9.96 9.96 0 012.93 7.07c0 5.559-4.56 10.12-10.119 10.12-.197 0-.394-.005-.59-.014z" />
    </svg>
  );
}

export function SiteFooter() {
  const { t, i18n } = useTranslation();
  const whatsappMessage = i18n.language.startsWith("it")
    ? "Ciao PITCALL, avrei bisogno di informazioni sulla piattaforma."
    : "Hi PITCALL, I'd like some information about the platform.";
  const whatsappHref = `https://wa.me/393522269269?text=${encodeURIComponent(whatsappMessage)}`;
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
        <div className="container-page flex flex-col items-center gap-4 py-4">
          <div className="flex items-center gap-2">
            <a
              href="https://www.instagram.com/pitcall_net?stkn=emF0aG82djI4M2Rv"
              target="_blank"
              rel="noreferrer noopener nofollow"
              aria-label="Instagram"
              className="p-2 text-white transition-colors hover:text-racing-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-racing-red focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Instagram className="size-5" aria-hidden="true" />
            </a>
            <a
              href="https://www.linkedin.com/company/pitcall/"
              target="_blank"
              rel="noreferrer noopener nofollow"
              aria-label="LinkedIn"
              className="p-2 text-white transition-colors hover:text-racing-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-racing-red focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Linkedin className="size-5" aria-hidden="true" />
            </a>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer noopener nofollow"
              aria-label="WhatsApp"
              className="p-2 text-white transition-colors hover:text-racing-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-racing-red focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <WhatsAppIcon className="size-5" />
            </a>
          </div>
          <div className="flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>© 2026 Pit Call</span>
            <span>Pit Call Code 44.029 / Z-1</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
