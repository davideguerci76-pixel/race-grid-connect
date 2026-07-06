import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { teams, jobs } from "@/lib/mock-data";

export const Route = createFileRoute("/scuderia/$id")({
  loader: ({ params }) => {
    const team = teams.find((t) => t.id === params.id);
    if (!team) throw notFound();
    return { team };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.team.name} — Scuderia · PaddockPro` },
          { name: "description", content: loaderData.team.bio },
        ]
      : [{ title: "Scuderia non trovata" }, { name: "robots", content: "noindex" }],
  }),
  component: TeamProfile,
  notFoundComponent: () => (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="container-page py-24 text-center">
        <h1 className="text-3xl font-black uppercase italic">Scuderia non trovata</h1>
        <Link to="/scuderie" className="mt-4 inline-block text-racing-red underline">Torna alla directory</Link>
      </div>
    </div>
  ),
});

function TeamProfile() {
  const { team } = Route.useLoaderData();
  const openJobs = jobs.filter((j) => j.teamId === team.id);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <header className="border-b border-border bg-pit">
        <div className="container-page py-16">
          <Link to="/scuderie" className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-racing-red">
            ← Directory scuderie
          </Link>
          <div className="mt-6 flex flex-col items-start gap-8 md:flex-row md:items-center">
            <div className="grid size-32 shrink-0 place-items-center bg-racing-red text-5xl font-black italic text-white">
              {team.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 border border-racing-red/30 bg-racing-red/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-racing-red">
                {team.discipline}
              </div>
              <h1 className="mt-3 text-5xl font-black uppercase italic tracking-tighter md:text-6xl">{team.name}</h1>
              <p className="mt-2 font-mono text-sm font-bold uppercase tracking-widest text-muted-foreground">
                {team.type} · {team.location}
              </p>
            </div>
            <button className="w-full bg-racing-red px-8 py-4 text-xs font-black uppercase tracking-widest text-white hover:brightness-110 md:w-auto">
              Segui scuderia
            </button>
          </div>
        </div>
      </header>

      <section className="border-b border-border">
        <div className="container-page grid grid-cols-2 divide-x divide-border md:grid-cols-4">
          {[
            ["Posizioni aperte", String(openJobs.length).padStart(2, "0")],
            ["Fondata nel", team.founded],
            ["Organico", team.size],
            ["Disciplina", team.discipline],
          ].map(([l, v]) => (
            <div key={l} className="px-4 py-8 first:pl-0 md:px-8">
              <div className="label-mono">{l}</div>
              <div className="mt-2 font-mono text-2xl font-black tracking-tighter text-racing-red">{v}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page grid gap-12 py-16 md:grid-cols-3">
        <div className="md:col-span-2">
          <h2 className="mb-4 text-3xl font-black uppercase italic tracking-tighter">Sulla scuderia</h2>
          <p className="mb-10 leading-relaxed text-muted-foreground">{team.bio}</p>

          <h2 className="mb-6 text-3xl font-black uppercase italic tracking-tighter">
            Annunci <span className="text-racing-red">attivi</span>
          </h2>
          {openJobs.length === 0 ? (
            <div className="border border-dashed border-border p-8 text-center text-muted-foreground">
              Nessuna posizione aperta al momento.
            </div>
          ) : (
            <div className="grid gap-3">
              {openJobs.map((j) => (
                <article key={j.id} className="flex items-center gap-6 border border-border bg-card p-5 transition-colors hover:border-racing-red">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-3">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-racing-yellow">{j.discipline}</span>
                      <span className="text-border">/</span>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{j.duration}</span>
                    </div>
                    <h3 className="truncate text-lg font-black uppercase tracking-tight">{j.role}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{j.circuit} · {j.location}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold">{j.budget}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">/ {j.budgetUnit}</div>
                  </div>
                  <Link to="/bacheca" className="bg-foreground px-4 py-2 text-[11px] font-black uppercase tracking-widest text-background hover:bg-racing-red hover:text-white">
                    Candidati
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside>
          <div className="border border-border bg-card p-6">
            <div className="label-mono">Info paddock</div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between border-b border-border pb-2">
                <dt className="text-muted-foreground">Base</dt>
                <dd className="font-bold">{team.location}</dd>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <dt className="text-muted-foreground">Categoria</dt>
                <dd className="font-bold">{team.discipline}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Organico</dt>
                <dd className="font-bold">{team.size}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </section>

      <SiteFooter />
    </div>
  );
}
