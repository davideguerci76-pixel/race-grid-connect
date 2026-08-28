import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Pitcall — Motorsport Matching Platform" },
      {
        name: "description",
        content:
          "PITCALL is the motorsport matching platform built by paddock professionals: teams and freelancers matched by role, skills and real availability.",
      },
      { property: "og:title", content: "About Pitcall — Motorsport Matching Platform" },
      {
        property: "og:description",
        content:
          "PITCALL is the motorsport matching platform built by paddock professionals: teams and freelancers matched by role, skills and real availability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const { t } = useTranslation();

  return (
    <div className="container-page py-16 md:py-24">
      {/* Title */}
      <h1 className="text-4xl font-black uppercase italic tracking-tighter md:text-6xl">
        {t("about.title_a")} <span className="text-racing-red">{t("about.title_b")}</span>
      </h1>
      <p className="mt-6 max-w-3xl text-lg font-black uppercase italic tracking-tight text-foreground/90 md:text-2xl">
        {t("about.hero")}
      </p>

      {/* Intro */}
      <div className="mt-12 max-w-3xl space-y-6 text-base leading-relaxed text-foreground/80 md:text-lg">
        <p>{t("about.p1")}</p>
        <p className="font-semibold text-foreground">{t("about.p2")}</p>
        <p>{t("about.p3")}</p>
      </div>

      {/* Highlighted quote */}
      <div className="mt-12 max-w-3xl border-l-4 border-racing-red bg-card/60 py-6 pl-6 pr-4">
        <p className="text-xl font-black uppercase italic tracking-tight md:text-2xl">
          {t("about.quote")}
        </p>
      </div>

      <div className="mt-12 max-w-3xl space-y-6 text-base leading-relaxed text-foreground/80 md:text-lg">
        <p>{t("about.p4")}</p>
      </div>

      {/* Built from experience */}
      <section className="mt-20 max-w-3xl">
        <h2 className="text-lg font-black uppercase md:text-xl">
          {t("about.exp_title")}
        </h2>
        <div className="mt-6 space-y-6 text-base leading-relaxed text-foreground/80 md:text-lg">
          <p>{t("about.exp_p1")}</p>
          <p>{t("about.exp_p2")}</p>
          <p className="font-semibold text-foreground">{t("about.exp_p3")}</p>
        </div>
      </section>

      {/* Mission */}
      <section className="mt-20 max-w-3xl">
        <h2 className="text-lg font-black uppercase md:text-xl">
          {t("about.mission_title")}
        </h2>
        <p className="mt-6 text-base leading-relaxed text-foreground/80 md:text-lg">
          {t("about.mission_p1")}
        </p>
      </section>

      {/* CTA */}
      <div className="mt-20">
        <Link
          to="/auth"
          search={{ mode: "signup" as const }}
          className="group inline-flex items-center gap-3 border border-racing-red/50 bg-racing-red/10 px-6 py-4 text-sm font-black uppercase tracking-widest transition-all hover:border-racing-red hover:bg-racing-red/20"
        >
          {t("about.cta_a")} <span className="text-racing-red">{t("about.cta_b")}</span>
          <ArrowRight className="size-4 text-racing-red transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}
