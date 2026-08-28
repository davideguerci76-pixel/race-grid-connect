import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Pitcall FAQ — Motorsport Matching Explained" },
      {
        name: "description",
        content:
          "Answers about PITCALL: how motorsport matching works, full and partial matches, availability, identity reveal, ratings and tokens.",
      },
      { property: "og:title", content: "Pitcall FAQ — Motorsport Matching Explained" },
      {
        property: "og:description",
        content:
          "Answers about PITCALL: how motorsport matching works, full and partial matches, availability, identity reveal, ratings and tokens.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FaqPage,
});

type FaqItem = { q: string; a: string[] };

function FaqPage() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number | null>(0);

  const items = (t("faq.items", { returnObjects: true }) as unknown as FaqItem[]) ?? [];
  const list = Array.isArray(items) ? items : [];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="container-page flex-1 py-16 md:py-24">
        <h1 className="text-4xl font-black uppercase italic tracking-tighter md:text-6xl">
          {t("faq.title")}
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
          {t("faq.subtitle")}
        </p>

        <div className="mt-12 max-w-3xl">
          {list.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                className={cn(
                  "mb-3 overflow-hidden rounded-xl border bg-card/60 transition-colors",
                  isOpen ? "border-racing-red/45" : "border-border",
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left md:px-6"
                >
                  <h3 className="text-sm font-black uppercase tracking-tight md:text-[15px]">
                    {item.q}
                  </h3>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 transition-transform duration-200",
                      isOpen ? "rotate-180 text-racing-red" : "text-muted-foreground",
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="space-y-2.5 px-5 pb-6 text-sm leading-relaxed text-muted-foreground md:px-6 md:text-[15px]">
                    {item.a.map((p, j) => (
                      <p key={j}>{p}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <section className="mt-16 max-w-3xl">
          <h2 className="text-xl font-black uppercase italic tracking-tight md:text-2xl">
            {t("faq.cta_title")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">{t("faq.cta_text")}</p>
          <Link
            to="/contact"
            className="mt-6 inline-block bg-racing-red px-7 py-3.5 text-xs font-black uppercase tracking-widest text-white transition-all hover:brightness-110"
          >
            {t("faq.cta_button")}
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
