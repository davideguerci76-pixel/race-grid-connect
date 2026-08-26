import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BackButton } from "@/components/back-button";
import { PRIVACY_EMAIL, policyUrl } from "@/config/iubenda";

export const Route = createFileRoute("/legal/info")({
  head: () => ({
    meta: [
      { title: "Informazioni aggiuntive su infrastruttura, fornitori e trattamento dei dati · Pit Call" },
      { name: "description", content: "Dettagli tecnici su infrastruttura, fornitori e trattamento dei dati di Pit Call. Integra la Privacy Policy ufficiale di iubenda." },
      { property: "og:title", content: "Informazioni aggiuntive su infrastruttura, fornitori e trattamento dei dati · Pit Call" },
      { property: "og:description", content: "Dettagli tecnici su infrastruttura, fornitori e trattamento dei dati di Pit Call." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataInfoPage,
});

type Section = {
  id: string;
  heading: string;
  body: React.ReactNode;
};

const SECTIONS: Section[] = [
  {
    id: "introduzione",
    heading: "Introduzione",
    body: (
      <>
        <p>
          La presente pagina integra la{" "}
          <a
            href={policyUrl("privacy")}
            target="_blank"
            rel="noreferrer noopener nofollow"
            className="text-racing-red hover:underline"
          >
            Privacy Policy ufficiale di iubenda
          </a>{" "}
          fornendo maggiori dettagli tecnici sull&apos;infrastruttura utilizzata da Pit Call, sui fornitori esterni e sulle modalità di trattamento dei dati.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Questa pagina non sostituisce la Privacy Policy.</li>
          <li>La Privacy Policy di iubenda rimane il documento ufficiale.</li>
          <li>Questa pagina ha finalità esclusivamente informative e di trasparenza.</li>
        </ul>
      </>
    ),
  },
  {
    id: "infrastruttura",
    heading: "Infrastruttura della piattaforma",
    body: (
      <>
        <p>
          Pit Call è una piattaforma SaaS sviluppata per il matching tra Team Motorsport e professionisti freelance.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>L&apos;infrastruttura principale è ospitata nell&apos;Unione Europea.</li>
          <li>I dati vengono trattati esclusivamente per fornire il servizio.</li>
          <li>Pit Call non vende dati personali.</li>
          <li>Pit Call non utilizza sistemi pubblicitari.</li>
          <li>Pit Call non effettua profilazione commerciale degli utenti.</li>
        </ul>
      </>
    ),
  },
  {
    id: "supabase",
    heading: "Supabase",
    body: (
      <>
        <p>Supabase viene utilizzato per:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Database</li>
          <li>Autenticazione</li>
          <li>Gestione utenti</li>
          <li>Profili</li>
          <li>Calendario disponibilità</li>
          <li>Richieste (Pit Calls)</li>
          <li>Sistema di matching</li>
          <li>Rating</li>
          <li>Notifiche</li>
          <li>Token</li>
          <li>Storico attività</li>
        </ul>
        <p className="mt-4">Possono essere trattati: nome, cognome, email, dati professionali, competenze, lingue, esperienze, disponibilità, coordinate geografiche, dati relativi ai match e log tecnici.</p>
        <p className="mt-4">Regione del progetto: <strong>EU-Central-1 (Francoforte, Germania)</strong>.</p>
      </>
    ),
  },
  {
    id: "cloudflare",
    heading: "Cloudflare / Lovable Cloud",
    body: (
      <>
        <p>Cloudflare e Lovable Cloud vengono utilizzati per:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Hosting</li>
          <li>CDN</li>
          <li>Edge Functions</li>
          <li>Protezione della piattaforma</li>
          <li>Distribuzione dei contenuti</li>
          <li>Ottimizzazione delle prestazioni</li>
          <li>Sicurezza</li>
        </ul>
        <p className="mt-4">Possono essere trattati dati tecnici come: indirizzo IP, browser, user agent, log di sicurezza e richieste HTTP.</p>
      </>
    ),
  },
  {
    id: "google-oauth",
    heading: "Google OAuth",
    body: (
      <>
        <p>Il login tramite Google è completamente facoltativo.</p>
        <p className="mt-4">Possono essere ricevuti: nome, cognome, email, immagine profilo e identificativo Google necessario all&apos;autenticazione.</p>
      </>
    ),
  },
  {
    id: "resend",
    heading: "Resend",
    body: (
      <>
        <p>Resend viene utilizzato esclusivamente per:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Verifica email</li>
          <li>Recupero password</li>
          <li>Notifiche di sistema</li>
          <li>Email transazionali</li>
        </ul>
        <p className="mt-4">Non viene utilizzato per marketing né pubblicità.</p>
      </>
    ),
  },
  {
    id: "zoho-mail",
    heading: "Zoho Mail",
    body: (
      <>
        <p>Zoho Mail viene utilizzato per gestire gli indirizzi ufficiali della piattaforma:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>info@pitcall.net</li>
          <li>privacy@pitcall.net</li>
          <li>admin@pitcall.net</li>
        </ul>
        <p className="mt-4">Possono essere trattati: email, contenuto dei messaggi e allegati inviati volontariamente dagli utenti.</p>
      </>
    ),
  },
  {
    id: "nominatim",
    heading: "OpenStreetMap / Nominatim",
    body: (
      <>
        <p>Pit Call utilizza Nominatim esclusivamente per la ricerca delle località.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>La richiesta viene effettuata tramite proxy server-side.</li>
          <li>Il browser dell&apos;utente non comunica direttamente con Nominatim.</li>
        </ul>
      </>
    ),
  },
  {
    id: "carto",
    heading: "CARTO",
    body: (
      <>
        <p>CARTO viene utilizzato esclusivamente per la visualizzazione della mappa del mercato.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>La mappa viene caricata soltanto dopo il consenso espresso tramite iubenda.</li>
          <li>Senza consenso la piattaforma continua a funzionare normalmente.</li>
        </ul>
      </>
    ),
  },
  {
    id: "iubenda",
    heading: "iubenda",
    body: (
      <>
        <p>iubenda gestisce:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Cookie Banner</li>
          <li>Cookie Policy</li>
          <li>Privacy Policy</li>
          <li>Registrazione del consenso</li>
          <li>Preferenze privacy</li>
        </ul>
      </>
    ),
  },
  {
    id: "matching",
    heading: "Sistema di Matching",
    body: (
      <>
        <p>Pit Call utilizza un algoritmo proprietario.</p>
        <p className="mt-4">Vengono considerate competenze, ruolo, disponibilità, lingue, esperienza, posizione geografica e altri parametri professionali.</p>
        <p className="mt-4">Il risultato consiste esclusivamente in un indice di compatibilità. La decisione finale sull&apos;ingaggio è sempre presa dagli utenti. Pit Call non prende decisioni automatizzate aventi effetti giuridici.</p>
      </>
    ),
  },
  {
    id: "reputazione",
    heading: "Sistema reputazionale",
    body: (
      <>
        <ul className="list-disc space-y-1 pl-5">
          <li>Recensioni consentite solo dopo collaborazioni reali.</li>
          <li>Doppia recensione Team/Freelance.</li>
          <li>Moderazione dei contenuti segnalati.</li>
          <li>Possibilità di contestazione.</li>
          <li>Pubblicazione differita secondo le regole di double-blind.</li>
        </ul>
      </>
    ),
  },
  {
    id: "geolocalizzazione",
    heading: "Geolocalizzazione",
    body: (
      <>
        <ul className="list-disc space-y-1 pl-5">
          <li>Le coordinate vengono utilizzate esclusivamente per migliorare il matching.</li>
          <li>Pit Call non effettua tracciamento continuo della posizione.</li>
        </ul>
      </>
    ),
  },
  {
    id: "comunicazione",
    heading: "Comunicazione dei dati",
    body: (
      <>
        <p>I dati di contatto vengono condivisi esclusivamente secondo il funzionamento previsto dalla piattaforma.</p>
        <p className="mt-4">Una volta condivisi, Team e Freelance diventano autonomi Titolari del trattamento dei dati ricevuti.</p>
        <p className="mt-4">I dati non possono essere utilizzati per finalità di marketing o per creare database paralleli.</p>
      </>
    ),
  },
  {
    id: "conservazione",
    heading: "Conservazione dei dati",
    body: (
      <>
        <ul className="list-disc space-y-1 pl-5">
          <li>I dati vengono conservati per il tempo necessario all&apos;erogazione del servizio e agli obblighi di legge.</li>
          <li>I dati fiscali vengono conservati secondo la normativa applicabile.</li>
          <li>I log tecnici vengono mantenuti esclusivamente per esigenze di sicurezza.</li>
        </ul>
      </>
    ),
  },
  {
    id: "aggiornamenti",
    heading: "Aggiornamenti",
    body: (
      <p>
        Questa pagina potrà essere aggiornata nel tempo qualora vengano introdotti nuovi fornitori, nuovi servizi o modifiche all&apos;infrastruttura. Per richieste relative ai dati personali scrivere a{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`} className="text-racing-red hover:underline">{PRIVACY_EMAIL}</a>.
      </p>
    ),
  },
];

function DataInfoPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page py-16">
        <div className="label-mono">[LEGAL]</div>
        <h1 className="max-w-4xl text-4xl font-black uppercase italic tracking-tighter">
          Informazioni aggiuntive su infrastruttura, fornitori e trattamento dei dati
        </h1>

        <div className="mt-8 grid gap-10 lg:grid-cols-[280px_1fr]">
          <aside className="hidden lg:block">
            <nav className="card-surface sticky top-24 p-4">
              <div className="label-mono mb-3">[INDICE]</div>
              <ul className="space-y-2 text-sm">
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="text-muted-foreground transition-colors hover:text-racing-red"
                    >
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <div className="max-w-3xl space-y-10 text-sm text-muted-foreground">
            <div className="card-surface p-4 text-muted-foreground">
              <p>
                Documenti ufficiali:{" "}
                <a href={policyUrl("privacy")} target="_blank" rel="noreferrer noopener nofollow" className="text-racing-red hover:underline">Privacy Policy</a>
                {" · "}
                <a href={policyUrl("cookie")} target="_blank" rel="noreferrer noopener nofollow" className="text-racing-red hover:underline">Cookie Policy</a>
                {" · "}
                <Link to="/legal/$doc" params={{ doc: "terms" }} className="text-racing-red hover:underline">Terms & Conditions</Link>
              </p>
            </div>

            {SECTIONS.map((s) => (
              <section key={s.id} id={s.id}>
                <h2 className="mb-3 text-base font-bold uppercase tracking-tight text-foreground">{s.heading}</h2>
                <div className="space-y-3 leading-relaxed">{s.body}</div>
              </section>
            ))}
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
