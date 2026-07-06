import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { teams, jobs } from "@/lib/mock-data";

export const Route = createFileRoute("/scuderie")({
  head: () => ({
    meta: [
      { title: "Scuderie e team — PaddockPro" },
      { name: "description", content: "Sfoglia le scuderie di F1, Rally, GT e Karting registrate su PaddockPro." },
    ],
  }),
  component: Scuderie,
});

function Scuderie() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <header className="border-b border-border bg-pit">
        <div className="container-page py-16">
          <div className="font-mono text-xs font-bold uppercase tracking-widest text-racing-red">Directory Scuderie</div>
          <h1 className="mt-3 text-5xl font-black uppercase italic tracking-tighter md:text-6xl">
            Le <span className="text-racing-red">scuderie</span> del network
          </h1>
        </div>
      </header>
      <section className="container-page py-12">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => {
            const open = jobs.filter((j) => j.teamId === t.id).length;
            return (
              <Link
                key={t.id}
                to="/scuderia/$id"
                params={{ id: t.id }}
                className="group flex flex-col border border-border bg-card p-6 transition-colors hover:border-racing-red"
              >
                <div className="mb-6 flex items-center gap-4">
                  <div className="grid size-16 shrink-0 place-items-center bg-racing-red font-black italic text-white">
                    {t.initials}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-black uppercase italic">{t.name}</h3>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {t.type} · {t.location}
                    </p>
                  </div>
                </div>
                <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">{t.bio}</p>
                <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <div className="label-mono">Posizioni aperte</div>
                    <div className="font-mono text-lg font-black text-racing-red">{String(open).padStart(2, "0")}</div>
                  </div>
                  <span className="font-mono text-xs font-bold uppercase tracking-widest text-racing-red group-hover:underline">
                    Vedi profilo →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
