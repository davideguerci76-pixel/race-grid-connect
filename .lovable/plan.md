# Conformità GDPR/ePrivacy + integrazione iubenda

Obiettivo: rendere PITCALL conforme a GDPR ed ePrivacy, integrare iubenda (Privacy Policy, Cookie Policy, Cookie Banner) ed eliminare le chiamate superflue a servizi terzi dal browser.

## Cosa serve da te

- **ID sito iubenda** e **ID dei documenti** (Privacy Policy e Cookie Policy) generati nella tua dashboard iubenda.
- Conferma dell'indirizzo email privacy da usare nei documenti (oggi il codice cita `privacy@pitcall.app`, dominio errato).

Senza questi ID integro comunque tutto il codice, lasciando gli ID in una singola costante di configurazione da compilare.

## 1. Eliminare le chiamate a terzi dal browser

Dopo questi tre interventi, l'unico servizio terzo che resta a richiedere consenso è la mappa del mercato.

**Google Fonts → self-hosting.** Scarico i file WOFF2 del font Outfit nei pesi realmente usati (300/400/500/600/700/900), li servo da `public/fonts/`, dichiaro le `@font-face` in `src/styles.css` con `font-display: swap`, e rimuovo da `src/routes/__root.tsx` il `<link>` allo stylesheet Google e i due `preconnect`. Zero IP inviati a Google, zero impatto visivo, pagina anche più veloce.

**Nominatim → proxy server-side.** L'autocomplete indirizzi oggi chiama OpenStreetMap direttamente dal browser, inviando IP e testo digitato a un terzo. Sposto la chiamata in una server function (`src/lib/geocode.functions.ts`), con validazione input, rate-limit leggero e header `User-Agent` corretto come richiesto dalla policy OSM. `src/lib/geocode.ts` diventa un wrapper che chiama la server function: nessuna modifica ai componenti che lo usano. La ricerca diventa first-party e sparisce dal banner.

**Mappa CARTO → caricamento condizionato al consenso.** I tile della mappa mondiale (`basemaps.cartocdn.com`) restano un servizio terzo. La mappa non viene montata finché l'utente non ha dato il consenso alla categoria "interazione con piattaforme esterne": al suo posto compare un placeholder in stile PITCALL con un pulsante "Attiva mappa" che registra il consenso via iubenda e carica i tile. Le statistiche numeriche restano sempre visibili.

## 2. Integrazione iubenda

- Script Cookie Solution caricato in `src/routes/__root.tsx` con configurazione: banner GDPR, `perPurposeConsent`, auto-blocking attivo, lingua sincronizzata con quella scelta nell'app (EN/IT/ES/FR/DE), reject button e link "Preferenze cookie".
- Le pagine `/legal/privacy` e `/legal/cookie` smettono di usare il testo placeholder e mostrano gli embed dei documenti iubenda; `/legal/terms` resta gestita da noi (vedi punto 4).
- Link "Preferenze cookie" nel footer, accanto a Privacy e Cookie Policy, che riapre il pannello iubenda.
- Google Consent Mode v2: **non lo attivo**, perché non esistono Google Analytics, Ads o GTM nel progetto. Lo script iubenda viene però configurato in modo che aggiungerlo in futuro sia una sola riga.

## 3. Correzioni privacy nel prodotto

- **Cancellazione account (art. 17)**: nuova sezione "Privacy e dati" nel profilo con due azioni — esporta i miei dati (JSON con profilo, disponibilità, match, ingaggi, rating scritti) e cancella account. La cancellazione è server-side, richiede conferma digitando il proprio nome, anonimizza i rating ricevuti dagli altri (che restano validi come contenuto) e rimuove profilo, contatti, calendari e disponibilità.
- **Consenso alla registrazione**: nella pagina di signup, checkbox obbligatoria di accettazione di Terms e Privacy Policy con link ai documenti iubenda, e timestamp di accettazione salvato sul profilo come prova.
- **Informativa nei punti di raccolta**: nota breve accanto al campo telefono e al campo località, che spiega quando quel dato diventa visibile a un team (solo a match confermato).
- **Pulizia riferimenti a Stripe**: rimuovo la stringa `demo_mode_notice` residua nelle 5 lingue e il commento obsoleto, così non c'è traccia di un servizio di pagamento non attivo.
- Sostituisco `privacy@pitcall.app` con l'indirizzo corretto.

## 4. Terms of Service allineati al modello di business

Riscrivo `/legal/terms` (contenuto nostro, non iubenda) esplicitando che PITCALL:

- è una **piattaforma tecnologica SaaS di matching**, non un'agenzia per il lavoro né un intermediario di manodopera ai sensi del D.lgs. 276/2003, e non è parte del contratto tra team e freelance;
- vende **accesso a funzionalità tramite token**, non commissioni sull'ingaggio, con clausola di rinuncia al recesso per contenuto digitale fruito immediatamente (necessaria quando attiverai i pagamenti);
- impone ai team che sbloccano i dati di un freelance l'obbligo di trattarli come **titolari autonomi**, solo per finalità di ingaggio e in conformità al GDPR;
- disciplina i **rating** come contenuto generato dagli utenti, con policy di moderazione e diritto di contestazione (già supportato da `rating_flags`).

## Note tecniche

- Font: `@font-face` locali in `src/styles.css`; nessun `@import` remoto (vincolo Tailwind v4).
- Proxy geocoding: `createServerFn({ method: 'GET' })` pubblica, con validazione Zod e cache in memoria breve per rispettare la usage policy di Nominatim.
- Mappa: il componente Leaflet è già caricato lato client; il gate sul consenso avviene prima del mount, quindi nessuna richiesta parte prima dell'accettazione.
- Cancellazione account: server function autenticata che usa il client admin solo dopo aver verificato l'identità del chiamante.
- Il consenso alla registrazione richiede una migrazione con due colonne su `profiles` (accettazione termini e timestamp), con GRANT e policy RLS coerenti con quelle esistenti.

## Fuori ambito (da definire a livello organizzativo, non nel codice)

Registro dei trattamenti, DPA con i fornitori infrastrutturali, e periodi di conservazione definitivi: te li documento come testo pronto da incollare in iubenda, ma non sono modifiche al software.
