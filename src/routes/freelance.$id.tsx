import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { freelancers, jobs } from "@/lib/mock-data";

export const Route = createFileRoute("/freelance/$id")({
  loader: ({ params }) => {
    const freelancer = freelancers.find((f) => f.id === params.id);
    if (!freelancer) throw notFound();
    return { freelancer };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.freelancer.name} — ${loaderData.freelancer.role} · PaddockPro` },
          { name: "description", content: loaderData.freelancer.bio },
        ]
      : [{ title: "Freelance non trovato" }, { name: "robots", content: "noindex" }],
  }),
  component: FreelanceProfile,
  notFoundComponent: () => (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="container-page py-24 text-center">
        <h1 className="text-3xl font-black uppercase italic">Freelance non trovato</h1>
        <Link to="/freelance" className="mt-4 inline-block text-racing-red underline">Torna alla directory</Link>
      </div>
    </div>
  ),
});

function FreelanceProfile() {
  const { freelancer: f } = Route.useLoaderData();
  const suggested = jobs.filter((j) => j.discipline === f.specialization).slice(0, 3);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <header className="border-b border-border bg-pit">
        <div className="container-page py-16">
          <Link to="/freelance" className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-racing-red">
            ← Directory freelance
          </Link>
          <div className="mt-6 flex flex-col items-start gap-8 md:flex-row md:items-center">
            <div className="grid size-32 shrink-0 place-items-center bg-carbon font-mono text-4xl font-black text-racing-red outline outline-2 outline-border">
              {f.name.split(" ").map((n: string) => n[0]).join("")}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`inline-flex items-center gap-2 border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${f.availability === "Disponibile" ? "border-success text-success" : f.availability === "Occupato" ? "border-racing-yellow text-racing-yellow" : "border-border text-muted-foreground"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${f.availability === "Disponibile" ? "bg-success" : f.availability === "Occupato" ? "bg-racing-yellow" : "bg-muted-foreground"}`} />
                {f.availability}
              </div>
              <h1 className="mt-3 text-5xl font-black uppercase italic tracking-tighter md:text-6xl">{f.name}</h1>
              <p className="mt-2 font-mono text-sm font-bold uppercase tracking-widest text-racing-red">
                {f.role} · {f.specialization} · {f.location}
              </p>
            </div>
            <button className="w-full bg-racing-red px-8 py-4 text-xs font-black uppercase tracking-widest text-white hover:brightness-110 md:w-auto">
              Contatta ora →
            </button>
          </div>
        </div>
      </header>

      {/* Stats */}
      <section className="border-b border-border">
        <div className="container-page grid grid-cols-2 divide-x divide-border md:grid-cols-4">
          {[
            ["Tariffa", `€${f.dayRate}`, "/giorno"],
            ["Esperienza", f.experience, ""],
            ["Trasferte", f.travels ? "Sì" : "No", f.travels ? "Weekend WEB" : "Solo Italia"],
            ["Specialità", f.specialization, ""],
          ].map(([l, v, sub]) => (
            <div key={l} className="px-4 py-8 first:pl-0 md:px-8">
              <div className="label-mono">{l}</div>
              <div className="mt-2 font-mono text-2xl font-black tracking-tighter">{v}</div>
              {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="container-page grid gap-12 py-16 md:grid-cols-3">
        <div className="md:col-span-2 space-y-10">
          <div>
            <h2 className="mb-4 text-3xl font-black uppercase italic tracking-tighter">Profilo</h2>
            <p className="text-muted-foreground leading-relaxed">{f.bio}</p>
          </div>
          <div>
            <h2 className="mb-4 text-3xl font-black uppercase italic tracking-tighter">Skill</h2>
            <div className="flex flex-wrap gap-2">
              {f.skills.map((s: string) => (
                <span key={s} className="border border-border bg-pit px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-widest">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h2 className="mb-4 text-3xl font-black uppercase italic tracking-tighter">Portfolio / CV</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { l: "Stagione 2024/25", d: "GT World Challenge · P3 Monza" },
                { l: "Stagione 2023/24", d: "F2 Championship · Consulente" },
                { l: "Certificazione", d: "MoTeC i2 Pro Advanced" },
                { l: "CV Completo (PDF)", d: "Scarica →" },
              ].map((i) => (
                <div key={i.l} className="border border-border bg-card p-4">
                  <div className="label-mono">{i.l}</div>
                  <div className="mt-1 font-bold">{i.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="border border-racing-red bg-card p-6">
            <div className="label-mono">Ingaggio rapido</div>
            <div className="mt-2 font-mono text-3xl font-black tracking-tighter text-racing-red">€{f.dayRate}<span className="text-sm text-muted-foreground">/gg</span></div>
            <button className="mt-4 w-full bg-racing-red py-3 text-xs font-black uppercase tracking-widest text-white hover:brightness-110">
              Invia proposta
            </button>
            <button className="mt-2 w-full border border-border py-3 text-xs font-bold uppercase tracking-widest hover:bg-secondary">
              Salva nel roster
            </button>
          </div>
          <div className="border border-border bg-card p-6">
            <div className="label-mono mb-3">Annunci compatibili</div>
            <div className="space-y-2">
              {suggested.map((j) => (
                <Link key={j.id} to="/bacheca" className="block border-l-2 border-racing-red bg-pit p-3 hover:bg-secondary">
                  <div className="text-sm font-bold">{j.role}</div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{j.team}</div>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <SiteFooter />
    </div>
  );
}
