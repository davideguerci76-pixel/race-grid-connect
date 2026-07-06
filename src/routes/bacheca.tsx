import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { jobs, teams, type Discipline } from "@/lib/mock-data";

export const Route = createFileRoute("/bacheca")({
  head: () => ({
    meta: [
      { title: "Bacheca lavori motorsport — PaddockPro" },
      { name: "description", content: "Annunci di lavoro per freelance del motorsport: F1, Rally, GT e Karting. Filtra per ruolo, disciplina, circuito e durata." },
      { property: "og:title", content: "Bacheca lavori motorsport — PaddockPro" },
      { property: "og:description", content: "Sfoglia le posizioni attive nelle scuderie di Formula, Rally, GT e Karting." },
    ],
  }),
  component: Bacheca,
});

const DISCIPLINES: (Discipline | "Tutte")[] = ["Tutte", "F1", "Rally", "WEC/GT", "Karting"];
const DURATIONS = ["Tutte", "Intero campionato", "Solo weekend", "Sessione test"] as const;

function Bacheca() {
  const [discipline, setDiscipline] = useState<Discipline | "Tutte">("Tutte");
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>("Tutte");
  const [query, setQuery] = useState("");
  const [applyingTo, setApplyingTo] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  const filtered = jobs.filter((j) => {
    if (discipline !== "Tutte" && j.discipline !== discipline) return false;
    if (duration !== "Tutte" && j.duration !== duration) return false;
    if (query && !`${j.role} ${j.team} ${j.circuit}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      {/* Header */}
      <header className="border-b border-border bg-pit">
        <div className="container-page py-16">
          <div className="font-mono text-xs font-bold uppercase tracking-widest text-racing-red">Job Board</div>
          <h1 className="mt-3 text-5xl font-black uppercase italic tracking-tighter md:text-6xl">
            Posizioni <span className="text-racing-red">attive</span>
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            {filtered.length} di {jobs.length} annunci disponibili nel paddock. Filtra per disciplina, durata o circuito.
          </p>
        </div>
      </header>

      {/* Filters bar */}
      <section className="sticky top-16 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="container-page space-y-4 py-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label-mono mr-2">Disciplina</span>
            {DISCIPLINES.map((d) => (
              <button
                key={d}
                onClick={() => setDiscipline(d)}
                className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                  discipline === d ? "bg-racing-red text-white" : "border border-border bg-pit hover:border-racing-red"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-mono mr-2">Durata</span>
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                    duration === d ? "bg-foreground text-background" : "border border-border bg-pit hover:border-foreground"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca ruolo, circuito, team..."
              className="min-w-[220px] flex-1 border border-border bg-pit px-4 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-racing-red"
            />
          </div>
        </div>
      </section>

      {/* Listings */}
      <section className="container-page py-12">
        {filtered.length === 0 ? (
          <div className="border border-dashed border-border p-16 text-center">
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Nessun risultato</div>
            <div className="mt-2 text-xl font-bold">Nessun annuncio corrisponde ai filtri</div>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((j) => {
              const team = teams.find((t) => t.id === j.teamId);
              return (
                <article
                  key={j.id}
                  className="group flex flex-col items-start gap-6 border border-border bg-card p-6 transition-colors hover:border-racing-red md:flex-row md:items-center"
                >
                  <Link
                    to="/scuderia/$id"
                    params={{ id: j.teamId }}
                    className="grid size-16 shrink-0 place-items-center border border-border bg-pit font-mono text-sm font-black text-racing-red transition-colors hover:border-racing-red"
                  >
                    {team?.initials ?? "SC"}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-3">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-racing-yellow">{j.discipline}</span>
                      <span className="text-border">/</span>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{j.duration}</span>
                      <span className="text-border">/</span>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{j.posted}</span>
                    </div>
                    <h3 className="truncate text-xl font-black uppercase tracking-tight md:text-2xl">{j.role}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {j.team} · {j.circuit} · {j.location}
                    </p>
                  </div>
                  <div className="flex w-full items-center justify-between gap-6 md:w-auto md:flex-col md:items-end">
                    <div className="text-right">
                      <div className="label-mono">Budget</div>
                      <div className="font-mono text-lg font-bold tracking-tighter">
                        {j.budget}<span className="text-xs text-muted-foreground"> / {j.budgetUnit}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => { setApplyingTo(j.id); setSent(null); setMessage(""); }}
                      className="bg-foreground px-6 py-3 text-[11px] font-black uppercase tracking-widest text-background transition-colors hover:bg-racing-red hover:text-white"
                    >
                      Candidati
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Apply modal */}
      {applyingTo && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-background/80 p-4 backdrop-blur">
          <div className="w-full max-w-lg border border-racing-red bg-card p-8">
            {sent === applyingTo ? (
              <>
                <div className="font-mono text-xs font-bold uppercase tracking-widest text-success">✓ Candidatura inviata</div>
                <h3 className="mt-2 text-3xl font-black uppercase italic">Il team ti risponderà a breve.</h3>
                <p className="mt-3 text-sm text-muted-foreground">
                  Il tuo profilo è stato inviato con il messaggio allegato. Riceverai una notifica appena arriva una risposta.
                </p>
                <button
                  onClick={() => { setApplyingTo(null); setSent(null); }}
                  className="mt-6 w-full bg-racing-red py-3 text-xs font-black uppercase tracking-widest text-white hover:brightness-110"
                >
                  Chiudi
                </button>
              </>
            ) : (
              <>
                <div className="font-mono text-xs font-bold uppercase tracking-widest text-racing-red">Candidatura al volo</div>
                <h3 className="mt-2 text-2xl font-black uppercase italic">
                  {jobs.find((j) => j.id === applyingTo)?.role}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {jobs.find((j) => j.id === applyingTo)?.team}
                </p>
                <label className="label-mono mt-6 block">Messaggio al team</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="Presentati brevemente, indica disponibilità e perché sei il candidato giusto..."
                  className="mt-2 w-full border border-border bg-pit p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-racing-red"
                />
                <div className="mt-3 text-[11px] text-muted-foreground">
                  Verrà allegato automaticamente il tuo profilo, CV e portfolio.
                </div>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => setApplyingTo(null)}
                    className="flex-1 border border-border py-3 text-xs font-bold uppercase tracking-widest hover:bg-secondary"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={() => setSent(applyingTo)}
                    disabled={!message.trim()}
                    className="flex-1 bg-racing-red py-3 text-xs font-black uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-40"
                  >
                    Invia candidatura →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}
