import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="mt-24 border-t border-border bg-carbon">
      <div className="container-page grid gap-10 py-16 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 text-xl font-black italic tracking-tighter">
            <span className="inline-block h-6 w-6 skew-x-[-15deg] bg-racing-red" />
            PADDOCK<span className="text-racing-red">PRO</span>
          </div>
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        <div>
          <div className="label-mono mb-3">{t("footer.network")}</div>
          <ul className="space-y-2 text-sm">
            <li>
              <Link to="/jobs" className="text-muted-foreground transition-colors hover:text-racing-red">
                {t("nav.jobs")}
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
          <span>© 2026 PaddockPro</span>
          <span>Paddock Code 44.029 / Z-1</span>
        </div>
      </div>
    </footer>
  );
}
