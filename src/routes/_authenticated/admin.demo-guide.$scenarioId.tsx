import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { getDemoGuide } from "@/lib/demo.functions";

export const Route = createFileRoute("/_authenticated/admin/demo-guide/$scenarioId")({
  ssr: false,
  component: DemoGuide,
});

type Lang = "it" | "en";
const T = (t: { it: string; en: string } | undefined, l: Lang) => (t ? t[l] : "");

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DemoGuide() {
  const { scenarioId } = Route.useParams();
  const [lang, setLang] = useState<Lang>("it");
  const guideFn = useServerFn(getDemoGuide);
  const { data, isLoading, error } = useQuery({
    queryKey: ["demo-guide", scenarioId],
    queryFn: () => guideFn({ data: { scenario_id: scenarioId } }),
  });

  if (isLoading)
    return (
      <div className="flex items-center gap-2 p-6 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  if (error) return <div className="p-6 text-sm text-racing-red">{(error as Error).message}</div>;
  if (!data) return null;

  const g = data as any;
  const ok = g.status === "READY";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2 print:max-w-none print:p-0">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-3 border border-border p-3">
        <Link to="/admin/testing" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground">
          ← Testing Lab
        </Link>
        <div className="flex items-center gap-2">
          {(["it", "en"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${
                lang === l ? "border-racing-red bg-racing-red/10 text-racing-red" : "border-border hover:bg-secondary"
              }`}
            >
              {l}
            </button>
          ))}
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
          >
            <Printer className="size-3" /> {lang === "it" ? "Stampa / PDF" : "Print / PDF"}
          </button>
        </div>
      </div>

      <header className="border border-border p-4">
        <h1 className="text-2xl font-black uppercase tracking-tight">{T(g.scenario.title, lang)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{T(g.scenario.description, lang)}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] sm:grid-cols-4">
          <Info label={lang === "it" ? "Versione" : "Version"} value={g.scenario.version} />
          <Info label="Anchor" value={g.anchor} />
          <Info label={lang === "it" ? "Oggi" : "Today"} value={g.today} />
          <Info
            label="Status"
            value={g.status}
            tone={ok ? "ok" : "bad"}
          />
        </div>
        {g.seed_is_today === false && (
          <p className="mt-2 text-[11px] font-bold text-racing-red">
            {lang === "it"
              ? `ATTENZIONE: questo dataset è stato generato il ${g.today}. Esegui di nuovo “Reset & seed” oggi prima della demo: lo scenario SOS richiede che il primo giorno sia la data odierna.`
              : `WARNING: this dataset was generated on ${g.today}. Run “Reset & seed” again today before the demo: the SOS scenario requires its first day to be the current date.`}
          </p>
        )}
        {g.live_unchanged === false && (
          <p className="mt-2 text-[11px] font-bold text-racing-red">
            {lang === "it"
              ? "ATTENZIONE: lo snapshot LIVE è cambiato durante il seed. Non usare questa demo."
              : "WARNING: the LIVE snapshot changed during seeding. Do not use this demo."}
          </p>
        )}
      </header>

      <Section title={lang === "it" ? "Cast" : "Cast"}>
        <div className="space-y-2">
          {g.teams.map((t: any) => (
            <Card key={t.key} title={`${t.name} — ${T(t.role_in_demo, lang)}`}>
              <p>{T(t.bio, lang)}</p>
              <Mono>
                {t.email} · {t.city} · {t.tokens} token
              </Mono>
            </Card>
          ))}
          {g.freelancers.map((f: any) => (
            <Card key={f.key} title={`${f.name} — ${T(f.role_in_demo, lang)}`}>
              <p>{T(f.headline, lang)}</p>
              <Mono>
                {f.email} · {f.city} · {f.day_rate}€/{lang === "it" ? "giorno" : "day"} · {f.years_experience}{" "}
                {lang === "it" ? "anni" : "years"} · {f.sub_roles.map((s: any) => `${s.sub_role}/${s.level}`).join(", ")}
              </Mono>
              <Mono>
                {lang === "it" ? "Skill" : "Skills"}: {f.skills.join(", ")} · {lang === "it" ? "Lingue" : "Languages"}:{" "}
                {f.languages.map((l: any) => `${l.code} (${l.level})`).join(", ")}
              </Mono>
              <Mono>
                {lang === "it" ? "Disponibilità" : "Availability"}: {f.availability.join(", ") || "—"}
              </Mono>
            </Card>
          ))}
        </div>
      </Section>

      {g.pitCalls.map((p: any) => (
        <Section key={p.key} title={T(p.title, lang)}>
          <p className="mb-3 text-sm text-muted-foreground">{T(p.narrative, lang)}</p>

          <SubTitle>{lang === "it" ? "Input esatti da inserire" : "Exact inputs to enter"}</SubTitle>
          <Mono>
            {lang === "it" ? "Team" : "Team"}: {p.team} · {p.input.role_group} / {p.input.sub_role} (min{" "}
            {p.input.sub_role_min_level}) · {p.input.discipline} · {p.input.duration} · {p.input.search_mode}
          </Mono>
          {p.ics ? (
            <Mono>
              {lang === "it" ? "Date" : "Dates"}: {p.ics.day_count} {lang === "it" ? "giorni da file ICS" : "days from ICS file"} (
              {p.input.dates[0]} → {p.input.dates[p.input.dates.length - 1]}) · {p.input.location} · {p.input.location_relevance}{" "}
              {p.input.location_radius_km}km
            </Mono>
          ) : (
            <Mono>
              {lang === "it" ? "Date" : "Dates"}: {p.input.dates.join(", ")} · {p.input.location} ·{" "}
              {p.input.location_relevance} {p.input.location_radius_km}km
            </Mono>
          )}
          <Mono>
            {lang === "it" ? "Skill" : "Skills"}: {p.input.skills.join(", ") || "—"} · budget {p.input.budget_min}–
            {p.input.budget_max}€{p.input.duration === "full_season" ? (lang === "it" ? "/stagione" : "/season") : ""} ·{" "}
            {lang === "it" ? "Trasferte" : "Travel"}: {p.input.travel_required ? "sì/yes" : "no"}
          </Mono>

          {p.ics && (
            <>
              <SubTitle>{lang === "it" ? "File ICS da caricare a mano" : "ICS file to upload by hand"}</SubTitle>
              <div className="flex flex-wrap items-center gap-3">
                <Mono>{p.ics.filename}</Mono>
                {p.ics.text && (
                  <button
                    onClick={() => downloadText(p.ics.filename, p.ics.text)}
                    className="no-print inline-flex items-center gap-2 border border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
                  >
                    <Download className="size-3" /> {lang === "it" ? "Scarica .ics" : "Download .ics"}
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {lang === "it"
                  ? "Il file non viene mai importato dal seed: va caricato dall'operatore nel form Pit Call (“Importa file .ics”)."
                  : "The file is never imported by the seed: the operator uploads it in the Pit Call form (“Import .ics”)."}
              </p>
              <table className="mt-2 w-full border-collapse text-[11px]">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="border border-border p-1">Round</th>
                    <th className="border border-border p-1">{lang === "it" ? "Dal" : "From"}</th>
                    <th className="border border-border p-1">{lang === "it" ? "Al" : "To"}</th>
                  </tr>
                </thead>
                <tbody>
                  {p.ics.rounds.map((r: any) => (
                    <tr key={r.label}>
                      <td className="border border-border p-1">{r.label}</td>
                      <td className="border border-border p-1 font-mono">{r.start}</td>
                      <td className="border border-border p-1 font-mono">{r.end}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <SubTitle>{lang === "it" ? "Passi" : "Steps"}</SubTitle>
          <ol className="ml-4 list-decimal space-y-1 text-sm">
            {p.steps.map((s: any, i: number) => (
              <li key={i}>{T(s, lang)}</li>
            ))}
          </ol>

          <SubTitle>{lang === "it" ? "Risultato atteso / verificato" : "Expected / verified"}</SubTitle>
          <Mono>
            Full: {(p.expected.full ?? []).join(", ") || "—"} · Partial: {(p.expected.partial ?? []).join(", ") || "—"}
            {p.expected.ranking ? ` · Ranking: ${p.expected.ranking.join(" > ")}` : ""}
          </Mono>
          {p.probe && (
            <table className="mt-2 w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="border border-border p-1">Persona</th>
                  <th className="border border-border p-1">{lang === "it" ? "Tipo" : "Type"}</th>
                  <th className="border border-border p-1">Relevance</th>
                  <th className="border border-border p-1">Score</th>
                </tr>
              </thead>
              <tbody>
                {p.probe.map((r: any) => (
                  <tr key={r.key}>
                    <td className="border border-border p-1 font-mono">{r.key}</td>
                    <td className="border border-border p-1">{r.partial ? `Partial (-${r.missing_days}d)` : "Full"}</td>
                    <td className="border border-border p-1 font-mono">{Number(r.skills_score).toFixed(1)}%</td>
                    <td className="border border-border p-1 font-mono">{Number(r.final_score).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      ))}

      <Section title={lang === "it" ? "Availability Opportunity" : "Availability Opportunity"}>
        <Mono>
          {g.availabilityOpportunity.freelancerName} · {lang === "it" ? "date da aggiungere" : "dates to add"}:{" "}
          {g.availabilityOpportunity.dates.join(", ")}
        </Mono>
        <ol className="ml-4 mt-2 list-decimal space-y-1 text-sm">
          {g.availabilityOpportunity.steps.map((s: any, i: number) => (
            <li key={i}>{T(s, lang)}</li>
          ))}
        </ol>
      </Section>

      <Section title={lang === "it" ? "My Pool" : "My Pool"}>
        <Mono>
          {g.pool.team} · {lang === "it" ? "membri" : "members"}: {g.pool.members.join(", ")}
        </Mono>
        <ol className="ml-4 mt-2 list-decimal space-y-1 text-sm">
          {g.pool.steps.map((s: any, i: number) => (
            <li key={i}>{T(s, lang)}</li>
          ))}
        </ol>
      </Section>

      <Section title="SOS Call">
        <Mono>
          {g.sos.team} · {lang === "it" ? "Pit Call di oggi" : "today's Pit Call"}:{" "}
          {g.sos.request ? `${g.sos.request.title} (${g.sos.request.start_date}, ${g.sos.request.status})` : "—"}
        </Mono>
        <ol className="ml-4 mt-2 list-decimal space-y-1 text-sm">
          {g.sos.steps.map((s: any, i: number) => (
            <li key={i}>{T(s, lang)}</li>
          ))}
        </ol>
      </Section>

      {g.verification && (
        <Section title={lang === "it" ? "Verifica automatica" : "Automatic verification"}>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="border border-border p-1">{lang === "it" ? "Controllo" : "Assertion"}</th>
                <th className="border border-border p-1">{lang === "it" ? "Atteso" : "Expected"}</th>
                <th className="border border-border p-1">{lang === "it" ? "Verificato" : "Verified"}</th>
              </tr>
            </thead>
            <tbody>
              {g.verification.assertions.map((a: any, i: number) => (
                <tr key={i} className={a.pass ? "" : "bg-racing-red/10"}>
                  <td className="border border-border p-1">{a.name}</td>
                  <td className="border border-border p-1 font-mono">{a.expected}</td>
                  <td className={`border border-border p-1 font-mono ${a.pass ? "" : "font-bold text-racing-red"}`}>
                    {a.verified}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

function Info({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="border border-border p-2">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={tone === "bad" ? "font-bold text-racing-red" : tone === "ok" ? "font-bold text-racing-green" : ""}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border p-4">
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-racing-yellow">{title}</h2>
      {children}
    </section>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{children}</div>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border p-3">
      <div className="text-[11px] font-bold uppercase tracking-widest">{title}</div>
      <div className="mt-1 space-y-1 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11px] text-muted-foreground">{children}</p>;
}
