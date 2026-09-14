import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import heroImg from "@/assets/hero-pit.jpg";
import logoFull from "@/assets/pitcall-logo-full.png.asset.json";
import preopeningImg from "@/assets/preopening-pitlane.webp.asset.json";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { UserRoundCheck, Headset, Cog, ListChecks, Handshake } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { MarketHighlights, useMarketStats } from "@/components/market-highlights";
import { getPublicFlags } from "@/lib/flags.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PITCALL — Motorsport Jobs & Freelancers" },
      { name: "description", content: "Connect motorsport teams and freelancers by role, skills, location and real availability." },
      { property: "og:title", content: "PITCALL — Motorsport Jobs & Freelancers" },
      { property: "og:description", content: "Connect motorsport teams and freelancers by role, skills, location and real availability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: () => getPublicFlags(),
  component: Home,
});

function ComingSoon() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <img src={logoFull.url} alt="Pit Call — Box. Now!" width={1089} height={424} className="w-full max-w-md object-contain mix-blend-screen" />
      <h1 className="mt-10 text-4xl font-black uppercase italic tracking-tighter md:text-6xl">
        {t("sweep_admin_a.home_coming_soon.coming_soon_title")}
      </h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        {t("sweep_admin_a.home_coming_soon.coming_soon_claim")}
      </p>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link
          to="/auth"
          search={{ mode: "signin" as const }}
          className="border border-border bg-card px-8 py-4 text-sm font-black uppercase tracking-widest transition-colors hover:bg-secondary"
        >
          {t("nav.signin")}
        </Link>
        <Link
          to="/auth"
          search={{ mode: "signup" as const }}
          className="bg-racing-red px-8 py-4 text-sm font-black uppercase tracking-widest text-white transition-[filter] hover:brightness-110"
        >
          {t("nav.signup")}
        </Link>
      </div>

      <div className="mt-10 inline-flex items-center gap-2 border border-racing-red/30 bg-racing-red/10 px-3 py-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-racing-red" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-racing-red">PITCALL</span>
      </div>
    </div>
  );
}

type PreopeningHeadlineLayout = {
  lead: number[];
  join: number[];
};

const PREOPENING_HEADLINE_LAYOUTS: Record<string, PreopeningHeadlineLayout> = {
  en: { lead: [2, 2], join: [4, 3] },
  it: { lead: [2, 2], join: [4, 3] },
  es: { lead: [2, 2], join: [4, 4] },
  fr: { lead: [1, 2], join: [4, 4] },
  de: { lead: [2, 3], join: [3, 3, 3] },
};

function splitPhrase(phrase: string, groupSizes: number[]) {
  const words = phrase.trim().split(/\s+/);
  let offset = 0;

  return groupSizes.map((size, index) => {
    const group = words.slice(offset, offset + size).join(" ");
    offset += size;
    return { group, isLast: index === groupSizes.length - 1 };
  });
}

function Home() {
  const { t, i18n } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const flags = Route.useLoaderData();
  const { data: stats } = useMarketStats();
  const language = i18n.resolvedLanguage?.split("-")[0] ?? "en";
  const headlineLayout = PREOPENING_HEADLINE_LAYOUTS[language] ?? PREOPENING_HEADLINE_LAYOUTS.en;
  const leadGroups = splitPhrase(t("home.preopening.headline_rest"), headlineLayout.lead);
  const joinGroups = splitPhrase(t("home.preopening.join_headline"), headlineLayout.join);

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, user, navigate]);

  if (flags?.comingSoon && !user) return <ComingSoon />;




  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-racing-red selection:text-white">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <img
          src={heroImg}
          alt="Race car in pit garage"
          width={1600}
          height={1200}
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
        <div className="container-page relative py-24 md:py-32">
          <img
            src={logoFull.url}
            alt="Pit Call — Box. Now!"
            width={1089} height={424}
            className="mb-8 w-full max-w-[40rem] object-contain mix-blend-screen"
          />
          <h1 className="mt-8 max-w-3xl text-6xl font-black uppercase italic leading-[0.9] tracking-tighter max-[380px]:text-5xl md:max-w-full md:text-8xl">
            {t("home.hero_1")}<br />
            <span className="text-racing-red">{t("home.hero_2")}</span>{" "}{t("home.hero_3")}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">{t("home.sub")}</p>

          <div className="mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
            <Link
              to="/auth"
              search={{ mode: "signup" as const, type: "freelancer" as const }}
              className="group block border-l-4 border-racing-red bg-pit p-4 transition-all hover:bg-secondary hover:shadow-lg hover:shadow-racing-red/15 md:p-5"
            >
              <div className="text-base font-black uppercase italic tracking-tighter text-foreground md:text-lg">
                {t("home.cta_freelancer_title")}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground md:mt-1 md:text-sm md:whitespace-nowrap">
                {t("home.cta_freelancer_body")}
              </div>
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" as const, type: "team" as const }}
              className="group block border-l-4 border-racing-yellow bg-pit p-4 transition-all hover:bg-secondary hover:shadow-lg hover:shadow-racing-yellow/15 md:p-5"
            >
              <div className="text-base font-black uppercase italic tracking-tighter text-foreground md:text-lg">
                {t("home.cta_team_title")}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground md:mt-1 md:text-sm md:whitespace-nowrap">
                {t("home.cta_team_body")}
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* PRE-OPENING CLAIM */}
      {flags?.homePreopeningClaim && (
        <section data-testid="preopening-claim" className="relative isolate overflow-hidden border-b border-border bg-pit">
          <img
            src={preopeningImg.url}
            alt="PITCALL pit lane at sunset"
            width={1920}
            height={896}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover object-[62%_center] sm:object-[58%_center] lg:object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/25 sm:via-background/80 lg:via-background/60" />
          <div className="container-page relative flex min-h-[31rem] items-center py-16 sm:min-h-[34rem] sm:py-20 lg:min-h-[36rem] lg:py-24">
            <div className="max-w-2xl lg:max-w-[55%]">
              <div className="mb-5 h-0.5 w-12 bg-racing-red" />
              <h2 className="text-3xl font-black uppercase italic leading-tight tracking-tighter sm:text-4xl lg:text-5xl">
                <span className="block whitespace-nowrap sm:inline-block">
                  <span className="text-racing-red">{t("home.preopening.headline_brand")}</span>{" "}
                  {leadGroups[0]?.group}
                </span>
                {leadGroups.slice(1).map(({ group }) => (
                  <span key={group} className="block whitespace-nowrap sm:ml-[0.22em] sm:inline-block">{group}</span>
                ))}
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-foreground/85 sm:text-base">
                {t("home.preopening.intro")}
              </p>

              <p className="mt-7 text-sm text-muted-foreground sm:text-base">{t("home.preopening.bridge")}</p>
              <h3 className="mt-1 text-3xl font-black uppercase italic leading-tight tracking-tighter sm:text-4xl lg:text-5xl">
                {joinGroups.map(({ group, isLast }) => (
                  <span key={group} className="block whitespace-nowrap sm:mr-[0.22em] sm:inline-block">
                    {group}{" "}
                    {isLast && <span className="text-racing-red">{t("home.preopening.join_now")}</span>}
                  </span>
                ))}
              </h3>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-foreground/85 sm:text-base">
                {t("home.preopening.join_body")}
              </p>

              <div className="mt-7 border-l-2 border-racing-red pl-4 text-sm font-bold leading-relaxed text-foreground sm:text-base">
                <div>{t("home.preopening.stay_connected")}</div>
                <div className="text-racing-red">{t("home.preopening.notification")}</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* HOW */}
      <section className="border-b border-border">
        <div className="container-page py-20">
          <h2 className="mb-12 text-4xl font-black uppercase italic tracking-tighter md:text-5xl">
            {t("home.how_title")}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { icon: UserRoundCheck, t: "how_1_t", b: "how_1_b", anim: "group-hover:animate-pit-pulse" },
              { icon: Headset, t: "how_2_t", b: "how_2_b", anim: "group-hover:animate-pit-pulse" },
              { icon: Cog, t: "how_3_t", b: "how_3_b", anim: "group-hover:animate-pit-spin" },
              { icon: ListChecks, t: "how_4_t", b: "how_4_b", anim: "group-hover:animate-pit-list" },
              { icon: Handshake, t: "how_5_t", b: "how_5_b", anim: "group-hover:animate-pit-pulse group-hover:drop-shadow-[0_0_5px_oklch(0.58_0.22_27/0.5)]" },
            ].map((s, i) => (
              <div key={s.t} className="group rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-racing-red/50 hover:shadow-[0_0_24px_-8px_oklch(0.58_0.22_27/0.3)]">
                <div className="flex items-center justify-between">
                  <s.icon className={`size-8 text-racing-red ${s.anim}`} strokeWidth={1.5} />
                  <div className="font-mono text-xs text-muted-foreground">0{i + 1}</div>
                </div>
                <div className="mt-4 text-lg font-black uppercase">{t(`home.${s.t}`)}</div>
                <div className="mt-2 text-sm text-muted-foreground">{t(`home.${s.b}`)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MARKET HIGHLIGHTS */}
      {flags?.homeStats && (
      <section className="border-b border-border">
        <div className="container-page py-20">
          <MarketHighlights />
        </div>
      </section>
      )}

      {/* STATS */}

      {flags?.homeStats && (
      <section className="border-b border-border bg-pit">
        <div className="container-page grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            [stats ? String(stats.totals.freelancers) : "—", t("home.stats.specialists")],
            [stats ? String(stats.totals.teams) : "—", t("home.stats.teams")],
            [stats ? String(new Set((stats.by_country ?? []).map((c) => c.country).filter(Boolean)).size) : "—", t("home.stats.countries")],
          ].map(([n, l]) => (
            <div key={l} className="px-4 py-8 first:pl-0 md:px-8">
              <div className="font-mono text-3xl font-black tracking-tighter text-racing-red md:text-4xl">{n}</div>
              <div className="label-mono mt-2">{l}</div>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* CTA */}
      <section className="bg-racing-red">
        <div className="container-page flex flex-col items-start justify-between gap-8 py-16 md:flex-row md:items-center">
          <div>
            <div className="text-4xl font-black uppercase italic tracking-tighter text-white md:text-5xl">{t("home.cta_ready")}</div>
            <div className="mt-2 font-mono text-xs uppercase tracking-widest text-white/80">{t("home.cta_free")}</div>
          </div>
          <Link
            to="/auth"
            search={{ mode: "signup" as const }}
            className="bg-background px-8 py-4 text-sm font-black uppercase tracking-widest text-foreground transition-colors hover:bg-carbon"
          >
            {t("home.cta_start")}
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
