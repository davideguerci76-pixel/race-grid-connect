import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BackButton } from "@/components/back-button";
import { PRIVACY_EMAIL, policyUrl } from "@/config/iubenda";

export const Route = createFileRoute("/legal/info")({
  head: () => ({
    meta: [
      { title: "Additional information on infrastructure, providers and data processing · Pit Call" },
      {
        name: "description",
        content:
          "Technical details on Pit Call's infrastructure, providers and data processing. It supplements the official iubenda Privacy Policy.",
      },
      {
        property: "og:title",
        content: "Additional information on infrastructure, providers and data processing · Pit Call",
      },
      {
        property: "og:description",
        content: "Technical details on Pit Call's infrastructure, providers and data processing.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataInfoPage,
});

type Block = { t: "p"; v: string } | { t: "ul"; v: string[] };
type Section = { id: string; heading: string; blocks: Block[] };

/** Renders **bold**, [[privacy]] and [[email]] tokens inside a translated string. */
function RichText({ text, privacyLabel }: { text: string; privacyLabel: string }) {
  const parts = text.split(/(\[\[privacy\]\]|\[\[email\]\]|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part === "[[privacy]]") {
          return (
            <a
              key={i}
              href={policyUrl("privacy")}
              target="_blank"
              rel="noreferrer noopener nofollow"
              className="text-racing-red hover:underline"
            >
              {privacyLabel}
            </a>
          );
        }
        if (part === "[[email]]") {
          return (
            <a key={i} href={`mailto:${PRIVACY_EMAIL}`} className="text-racing-red hover:underline">
              {PRIVACY_EMAIL}
            </a>
          );
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function DataInfoPage() {
  const { t } = useTranslation();
  const sections = (t("legal_info.sections", { returnObjects: true }) ?? []) as Section[];
  const privacyLabel = t("footer.privacy", "Privacy Policy");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6">
        <BackButton />
      </div>
      <div className="container-page py-16">
        <div className="label-mono">[LEGAL]</div>
        <h1 className="max-w-4xl text-4xl font-black uppercase italic tracking-tighter">
          {t("legal_info.title")}
        </h1>

        <div className="mt-8 grid gap-10 lg:grid-cols-[280px_1fr]">
          <aside className="hidden lg:block">
            <nav className="card-surface sticky top-24 p-4">
              <div className="label-mono mb-3">{t("legal_info.index_label")}</div>
              <ul className="space-y-2 text-sm">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="text-muted-foreground transition-colors hover:text-racing-red"
                    >
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <div className="max-w-3xl space-y-10 text-sm text-muted-foreground">
            <div className="card-surface p-4 text-muted-foreground">
              <p>
                {t("legal_info.docs_label")}{" "}
                <a
                  href={policyUrl("privacy")}
                  target="_blank"
                  rel="noreferrer noopener nofollow"
                  className="text-racing-red hover:underline"
                >
                  {t("footer.privacy", "Privacy Policy")}
                </a>
                {" · "}
                <a
                  href={policyUrl("cookie")}
                  target="_blank"
                  rel="noreferrer noopener nofollow"
                  className="text-racing-red hover:underline"
                >
                  {t("footer.cookies", "Cookie Policy")}
                </a>
                {" · "}
                <Link
                  to="/legal/$doc"
                  params={{ doc: "terms" }}
                  className="text-racing-red hover:underline"
                >
                  {t("footer.terms", "Terms & Conditions")}
                </Link>
              </p>
            </div>

            {sections.map((s) => (
              <section key={s.id} id={s.id}>
                <h2 className="mb-3 text-base font-bold uppercase tracking-tight text-foreground">
                  {s.heading}
                </h2>
                <div className="space-y-3 leading-relaxed">
                  {s.blocks.map((b, i) =>
                    b.t === "ul" ? (
                      <ul key={i} className="list-disc space-y-1 pl-5">
                        {b.v.map((item, j) => (
                          <li key={j}>
                            <RichText text={item} privacyLabel={privacyLabel} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p key={i}>
                        <RichText text={b.v} privacyLabel={privacyLabel} />
                      </p>
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
