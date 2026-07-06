import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const searchSchema = z.object({
  tipo: z.enum(["freelance", "azienda"]).optional(),
});

export const Route = createFileRoute("/registrati")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Registrati — PaddockPro" },
      { name: "description", content: "Iscriviti a PaddockPro come freelance del motorsport o come scuderia." },
    ],
  }),
  component: Registrati,
});

function Registrati() {
  const { tipo } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [step, setStep] = useState(tipo ? 2 : 1);
  const [selected, setSelected] = useState<"freelance" | "azienda" | null>(tipo ?? null);
  const [done, setDone] = useState(false);

  function chooseType(t: "freelance" | "azienda") {
    setSelected(t);
    navigate({ search: { tipo: t } });
    setStep(2);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-16">
        <div className="mx-auto max-w-3xl">
          <div className="font-mono text-xs font-bold uppercase tracking-widest text-racing-red">
            Registrazione · Step {step}/2
          </div>
          <h1 className="mt-3 text-5xl font-black uppercase italic tracking-tighter md:text-6xl">
            {done ? "Benvenuto nel paddock." : step === 1 ? "Chi sei?" : selected === "freelance" ? "Profilo Freelance" : "Profilo Scuderia"}
          </h1>

          {done ? (
            <div className="mt-8 border border-success bg-card p-8">
              <div className="font-mono text-xs font-bold uppercase tracking-widest text-success">✓ Account creato</div>
              <p className="mt-3 text-lg">
                Controlla la tua email per verificare l'account. Poi potrai completare il profilo e iniziare a{" "}
                {selected === "freelance" ? "candidarti agli annunci." : "pubblicare le tue posizioni aperte."}
              </p>
            </div>
          ) : step === 1 ? (
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <button
                onClick={() => chooseType("freelance")}
                className="group border-l-4 border-racing-red bg-card p-8 text-left transition-colors hover:bg-pit"
              >
                <div className="font-mono text-xs font-bold uppercase tracking-widest text-racing-red">[01] Freelance</div>
                <div className="mt-3 text-2xl font-black uppercase italic">Sono uno specialista</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Meccanico, ingegnere di pista, telemetrista, data analyst, gommista. Cerco ingaggi per weekend di gara o intere stagioni.
                </p>
              </button>
              <button
                onClick={() => chooseType("azienda")}
                className="group border-l-4 border-racing-yellow bg-card p-8 text-left transition-colors hover:bg-pit"
              >
                <div className="font-mono text-xs font-bold uppercase tracking-widest text-racing-yellow">[02] Azienda / Scuderia</div>
                <div className="mt-3 text-2xl font-black uppercase italic">Siamo un team</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Scuderia, factory team o azienda del settore. Cerco freelance verificati da inserire nel paddock.
                </p>
              </button>
            </div>
          ) : (
            <form
              className="mt-10 space-y-6"
              onSubmit={(e) => { e.preventDefault(); setDone(true); }}
            >
              {selected === "freelance" ? (
                <>
                  <Field label="Nome completo" placeholder="Mario Rossi" />
                  <Field label="Email" type="email" placeholder="mario@paddock.pro" />
                  <div className="grid gap-6 md:grid-cols-2">
                    <Select label="Ruolo principale" options={["Ingegnere di Pista", "Meccanico", "Telemetrista", "Data Analyst", "Gommista"]} />
                    <Select label="Specializzazione" options={["F1", "Rally", "WEC/GT", "Karting"]} />
                  </div>
                  <div className="grid gap-6 md:grid-cols-2">
                    <Field label="Tariffa giornaliera (€)" type="number" placeholder="450" />
                    <Select label="Disponibilità trasferte weekend" options={["Sì, worldwide", "Solo Europa", "Solo Italia", "No"]} />
                  </div>
                </>
              ) : (
                <>
                  <Field label="Nome del team" placeholder="Apex Racing Scuderia" />
                  <Field label="Email aziendale" type="email" placeholder="team@scuderia.it" />
                  <div className="grid gap-6 md:grid-cols-2">
                    <Select label="Tipo di scuderia" options={["F1 / Junior team", "WRC / Rally", "WEC / GT", "Karting", "Factory / Costruttore"]} />
                    <Field label="Localizzazione" placeholder="Maranello, IT" />
                  </div>
                  <Field label="Sito web" placeholder="https://" />
                </>
              )}
              <Field label="Password" type="password" placeholder="••••••••" />
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="border border-border px-6 py-4 text-xs font-bold uppercase tracking-widest hover:bg-secondary"
                >
                  ← Indietro
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-racing-red py-4 text-xs font-black uppercase tracking-widest text-white hover:brightness-110"
                >
                  Crea account →
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <input
        {...props}
        required
        className="mt-2 w-full border border-border bg-pit px-4 py-3 outline-none placeholder:text-muted-foreground focus:border-racing-red"
      />
    </label>
  );
}

function Select({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <select
        required
        className="mt-2 w-full border border-border bg-pit px-4 py-3 outline-none focus:border-racing-red"
      >
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}
