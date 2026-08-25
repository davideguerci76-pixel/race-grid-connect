import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import logoCompact from "@/assets/pitcall-logo-compact.png.asset.json";

export function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="mt-24 border-t border-border bg-carbon">
      <div className="container-page grid gap-10 py-16 md:grid-cols-4">
        <div className="md:col-span-2">
          <img src={logoCompact.url} alt="Pit Call" width={1246} height={211} className="h-12 w-auto object-contain mix-blend-screen" />
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        <div>
          <div className="label-mono mb-3">{t("footer.network")}</div>
          <ul className="space-y-2 text-sm">
            <li>
              <Link to="/market" className="text-muted-foreground transition-colors hover:text-racing-red">
                {t("nav.market")}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="label-mono mb-3">{t("footer.legal")}</div>
          <ul className="space-y-2 text-sm">
            <li>
              <Link to="/legal/$doc" params={{ doc: "privacy" }} className="text-muted-foreground transition-colors hover:text-racing-red">
                {t("footer.privacy")}
              </Link>
            </li>
            <li>
              <Link to="/legal/$doc" params={{ doc: "terms" }} className="text-muted-foreground transition-colors hover:text-racing-red">
                {t("footer.terms")}
              </Link>
            </li>
            <li>
              <Link to="/legal/$doc" params={{ doc: "cookie" }} className="text-muted-foreground transition-colors hover:text-racing-red">
                {t("footer.cookie")}
              </Link>
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
