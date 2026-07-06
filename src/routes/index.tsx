import { createFileRoute, Link } from "@tanstack/react-router";
import heroImg from "@/assets/hero-pit.jpg";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { jobs, freelancers, teams } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const featuredJobs = jobs.slice(0, 3);
  const featuredFreelancers = freelancers.slice(0, 3);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-racing-red selection:text-white">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <img
          src={heroImg}
          alt="Vettura da corsa nel pit garage"
          width={1600}
          height={1200}
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
        <div className="container-page relative py-24 md:py-32">
          <div className="inline-flex items-center gap-2 border border-racing-red/30 bg-racing-red/10 px-3 py-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-racing-red" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-racing-red">
              Live · {jobs.length * 21} posizioni attive
            </span>
          </div>
          <h1 className="mt-8 max-w-3xl text-6xl font-black uppercase italic leading-[0.9] tracking-tighter md:text-8xl">
            Trova il tuo{" "}
            <span className="text-racing-red">prossimo</span>{" "}
            weekend di gara.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Il network d'élite che connette meccanici, ingegneri di pista, telemetristi e data analyst
            con scuderie di Formula, Rally, GT/Endurance e Karting.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 max-w-2xl">
            <Link
              to="/registrati"
              search={{ tipo: "freelance" as const }}
              className="group block border-l-4 border-racing-red bg-pit p-6 transition-colors hover:bg-secondary"
            >
              <div className="font-mono text-xs font-bold uppercase tracking-widest text-racing-red">
                [01] Sono un Freelance
              </div>
              <div className="mt-2 text-xl font-bold">
                Candidati ai weekend di gara <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </div>
            </Link>
            <Link
              to="/registrati"
              search={{ tipo: "azienda" as const }}
              className="group block border-l-4 border-racing-yellow bg-pit p-6 transition-colors hover:bg-secondary"
            >
              <div className="font-mono text-xs font-bold uppercase tracking-widest text-racing-yellow">
                [02] Siamo una Scuderia
              </div>
              <div className="mt-2 text-xl font-bold">
                Assumi specialisti verificati <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="border-b border-border bg-pit">
        <div className="container-page grid grid-cols-2 divide-x divide-border md:grid-cols-4">
          {[
            ["2.4k+", "Specialisti attivi"],
            ["124", "Scuderie iscritte"],
            ["18", "Nazioni coperte"],
            ["€ 620", "Tariffa media/giorno"],
          ].map(([n, l]) => (
            <div key={l} className="px-4 py-8 first:pl-0 md:px-8">
              <div className="font-mono text-3xl font-black tracking-tighter text-racing-red md:text-4xl">{n}</div>
              <div className="label-mono mt-2">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURED JOBS */}
      <section className="container-page py-20">
        <div className="mb-10 flex items-end justify-between">
          <h2 className="text-4xl font-black uppercase italic tracking-tighter underline decoration-racing-red decoration-4 underline-offset-8 md:text-5xl">
            Posizioni Attive
          </h2>
          <Link to="/bacheca" className="hidden text-xs font-bold uppercase tracking-widest text-racing-red hover:underline md:inline-block">
            Vedi tutta la bacheca →
          </Link>
        </div>
        <div className="grid gap-3">
          {featuredJobs.map((j) => (
            <article
              key={j.id}
              className="group flex flex-col items-start gap-6 border border-border bg-card p-6 transition-colors hover:border-racing-red md:flex-row md:items-center"
            >
              <div className="grid size-16 shrink-0 place-items-center border border-border bg-pit font-mono text-sm font-black text-racing-red">
                {teams.find(t => t.id === j.teamId)?.initials ?? "SC"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-3">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-racing-yellow">{j.discipline}</span>
                  <span className="text-border">/</span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{j.duration}</span>
                </div>
                <h3 className="truncate text-xl font-black uppercase tracking-tight md:text-2xl">{j.role}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{j.team} · {j.location}</p>
              </div>
              <div className="flex w-full items-center justify-between gap-6 md:w-auto md:flex-col md:items-end">
                <div className="text-right">
                  <div className="label-mono">Budget</div>
                  <div className="font-mono text-lg font-bold tracking-tighter">
                    {j.budget}<span className="text-xs text-muted-foreground"> / {j.budgetUnit}</span>
                  </div>
                </div>
                <Link
                  to="/bacheca"
                  className="bg-foreground px-6 py-3 text-[11px] font-black uppercase tracking-widest text-background transition-colors hover:bg-racing-red hover:text-white"
                >
                  Candidati
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* FEATURED FREELANCERS */}
      <section className="border-t border-border bg-pit py-20">
        <div className="container-page">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <h2 className="text-4xl font-black uppercase italic tracking-tighter underline decoration-racing-yellow decoration-4 underline-offset-8 md:text-5xl">
                Talent Verificati
              </h2>
              <p className="mt-3 max-w-md text-muted-foreground">Specialisti con esperienza in campionati internazionali.</p>
            </div>
            <Link to="/freelance" className="hidden text-xs font-bold uppercase tracking-widest text-racing-red hover:underline md:inline-block">
              Tutti i freelance →
            </Link>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {featuredFreelancers.map((f) => (
              <Link
                key={f.id}
                to="/freelance/$id"
                params={{ id: f.id }}
                className="group flex flex-col border border-border bg-card p-6 transition-colors hover:border-racing-red"
              >
                <div className="mb-6 flex items-start justify-between">
                  <div className="grid size-20 place-items-center bg-pit font-mono text-xl font-black text-racing-red outline outline-2 outline-border transition-colors group-hover:outline-racing-red">
                    {f.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div className="text-right">
                    <div className="label-mono">Disponibilità</div>
                    <div className={`mt-1 text-xs font-bold uppercase tracking-widest ${f.availability === "Disponibile" ? "text-success" : f.availability === "Occupato" ? "text-racing-yellow" : "text-muted-foreground"}`}>
                      {f.availability}
                    </div>
                  </div>
                </div>
                <h3 className="text-xl font-black uppercase italic">{f.name}</h3>
                <p className="mt-1 font-mono text-xs font-bold uppercase tracking-widest text-racing-red">
                  {f.role} · {f.specialization}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
                  <div>
                    <div className="label-mono">Tariffa</div>
                    <div className="font-mono font-bold">€{f.dayRate}/gg</div>
                  </div>
                  <div>
                    <div className="label-mono">Esperienza</div>
                    <div className="font-mono font-bold">{f.experience}</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-1">
                  {f.skills.slice(0, 3).map(s => (
                    <span key={s} className="border border-border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                      {s}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* DISCIPLINES */}
      <section className="container-page py-20">
        <h2 className="mb-10 text-4xl font-black uppercase italic tracking-tighter md:text-5xl">
          Discipline <span className="text-racing-red">coperte</span>
        </h2>
        <div className="grid gap-3 md:grid-cols-4">
          {["F1", "Rally", "WEC/GT", "Karting"].map((d, i) => (
            <div key={d} className="group border border-border bg-card p-8 transition-colors hover:border-racing-red">
              <div className="font-mono text-xs text-muted-foreground">0{i + 1}</div>
              <div className="mt-4 text-3xl font-black uppercase italic">{d}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {d === "F1" ? "Formula, junior series e sviluppo" : d === "Rally" ? "WRC, ERC, Rally2 e R5" : d === "WEC/GT" ? "Endurance, GT3, LMP" : "OK, OKJ, KZ, Rotax"}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-racing-red">
        <div className="container-page flex flex-col items-start justify-between gap-8 py-16 md:flex-row md:items-center">
          <div>
            <div className="text-4xl font-black uppercase italic tracking-tighter text-white md:text-5xl">Pronto a scendere in pista?</div>
            <div className="mt-2 font-mono text-xs uppercase tracking-widest text-white/80">
              Registrati gratis · Nessuna carta richiesta
            </div>
          </div>
          <Link
            to="/registrati"
            className="bg-background px-8 py-4 text-sm font-black uppercase tracking-widest text-foreground transition-colors hover:bg-carbon"
          >
            Inizia ora →
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
