import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import heroImg from "@/assets/hero-pit.jpg";
import logoFull from "@/assets/pitcall-logo-full.png.asset.json";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CalendarClock, ScanSearch, Coins, Star } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { MarketHighlights, useMarketStats } from "@/components/market-highlights";
import { getPublicFlags } from "@/lib/flags.functions";

export const Route = createFileRoute("/")({
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

function Home() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const flags = Route.useLoaderData();
  const { data: stats } = useMarketStats();

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
            className="mb-8 w-full max-w-md object-contain mix-blend-screen"
          />
          <div className="inline-flex items-center gap-2 border border-racing-red/30 bg-racing-red/10 px-3 py-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-racing-red" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-racing-red">
              {t("home.badge", { count: 124 })} LIVE
            </span>
          </div>
          <h1 className="mt-8 max-w-3xl text-6xl font-black uppercase italic leading-[0.9] tracking-tighter md:text-8xl">
            {t("home.hero_1")}{" "}
            <span className="text-racing-red">{t("home.hero_2")}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">{t("home.sub")}</p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 max-w-2xl">
            <Link
              to="/auth"
              search={{ mode: "signup" as const, type: "freelancer" as const }}
              className="group block border-l-4 border-racing-red bg-pit p-6 transition-colors hover:bg-secondary"
            >
              <div className="font-mono text-xs font-bold uppercase tracking-widest text-racing-red">[01]</div>
              <div className="mt-1 text-xl font-bold">{t("home.cta_freelancer_title")}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t("home.cta_freelancer_body")} <span className="inline-block transition-transform group-hover:translate-x-1">→</span></div>
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" as const, type: "team" as const }}
              className="group block border-l-4 border-racing-yellow bg-pit p-6 transition-colors hover:bg-secondary"
            >
              <div className="font-mono text-xs font-bold uppercase tracking-widest text-racing-yellow">[02]</div>
              <div className="mt-1 text-xl font-bold">{t("home.cta_team_title")}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t("home.cta_team_body")} <span className="inline-block transition-transform group-hover:translate-x-1">→</span></div>
            </Link>
          </div>
        </div>
      </section>

      {/* HOW */}
      <section className="border-b border-border">
        <div className="container-page py-20">
          <h2 className="mb-12 text-4xl font-black uppercase italic tracking-tighter md:text-5xl">
            {t("home.how_title")}
          </h2>
          <div className="grid gap-6 md:grid-cols-4">
            {[
              { icon: CalendarClock, t: "how_1_t", b: "how_1_b" },
              { icon: ScanSearch, t: "how_2_t", b: "how_2_b" },
              { icon: Coins, t: "how_3_t", b: "how_3_b" },
              { icon: Star, t: "how_4_t", b: "how_4_b" },
            ].map((s, i) => (
              <div key={s.t} className="border border-border bg-card p-6">
                <div className="flex items-center justify-between">
                  <s.icon className="size-8 text-racing-red" strokeWidth={1.5} />
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
