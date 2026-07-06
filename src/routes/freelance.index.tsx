import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { freelancers, type Discipline } from "@/lib/mock-data";

export const Route = createFileRoute("/freelance/")({
  head: () => ({
    meta: [
      { title: "Freelance del motorsport — PaddockPro" },
      { name: "description", content: "Trova ingegneri, meccanici, telemetristi e data analyst verificati per la tua scuderia." },
    ],
  }),
  component: FreelanceIndex,
});

const ROLES = ["Tutti", "Ingegnere di Pista", "Meccanico", "Telemetrista", "Data Analyst", "Gommista"];
const DISCIPLINES: (Discipline | "Tutte")[] = ["Tutte", "F1", "Rally", "WEC/GT", "Karting"];

function FreelanceIndex() {
  const [role, setRole] = useState("Tutti");
  const [disc, setDisc] = useState<Discipline | "Tutte">("Tutte");
  const [travelsOnly, setTravelsOnly] = useState(false);

  const filtered = freelancers.filter((f) => {
    if (role !== "Tutti" && !f.role.toLowerCase().includes(role.toLowerCase().split(" ")[0])) return false;
    if (disc !== "Tutte" && f.specialization !== disc) return false;
    if (travelsOnly && !f.travels) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <header className="border-b border-border bg-pit">
        <div className="container-page py-16">
          <div className="font-mono text-xs font-bold uppercase tracking-widest text-racing-red">Talent Directory</div>
          <h1 className="mt-3 text-5xl font-black uppercase italic tracking-tighter md:text-6xl">
            Freelance del <span className="text-racing-red">paddock</span>
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            {filtered.length} specialisti verificati pronti a lavorare con la tua scuderia.
          </p>
        </div>
      </header>

      {/* Filters */}
      <section className="sticky top-16 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="container-page space-y-4 py-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label-mono mr-2">Ruolo</span>
            {ROLES.map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                  role === r ? "bg-racing-red text-white" : "border border-border bg-pit hover:border-racing-red"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-mono mr-2">Disciplina</span>
              {DISCIPLINES.map((d) => (
                <button
                  key={d}
                  onClick={() => setDisc(d)}
                  className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                    disc === d ? "bg-foreground text-background" : "border border-border bg-pit hover:border-foreground"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-widest">
              <input
                type="checkbox"
                checked={travelsOnly}
                onChange={(e) => setTravelsOnly(e.target.checked)}
                className="size-4 accent-racing-red"
              />
              Solo con trasferte nei weekend
            </label>
          </div>
        </div>
      </section>

      <section className="container-page py-12">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((f) => (
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
                  <div className="label-mono">Status</div>
                  <div className={`mt-1 text-xs font-bold uppercase tracking-widest ${f.availability === "Disponibile" ? "text-success" : f.availability === "Occupato" ? "text-racing-yellow" : "text-muted-foreground"}`}>
                    {f.availability}
                  </div>
                </div>
              </div>
              <h3 className="text-xl font-black uppercase italic">{f.name}</h3>
              <p className="mt-1 font-mono text-xs font-bold uppercase tracking-widest text-racing-red">
                {f.role} · {f.specialization}
              </p>
              <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{f.bio}</p>
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
                <div>
                  <div className="label-mono">Tariffa</div>
                  <div className="font-mono font-bold">€{f.dayRate}/gg</div>
                </div>
                <div>
                  <div className="label-mono">Trasferte</div>
                  <div className="font-mono font-bold">{f.travels ? "Sì · WEB" : "Solo IT"}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
