# Audit di fattibilità: PITCALL su iOS + Android con Capacitor

Nessuna modifica effettuata. Solo analisi del progetto reale.

## 1. Compatibilità dello stack attuale

| Componente reale | Stato | Note |
|---|---|---|
| React 19 + TanStack Router (`src/routes/*`) | A | Il routing file-based funziona identico dentro una WebView |
| **TanStack Start con SSR + Nitro/Cloudflare** (`src/server.ts`, `vite.config.ts`) | **C** | Capacitor serve file statici da `capacitor://localhost`: non c'è SSR. Serve una build client-only e un origin remoto per il server |
| **~124 `createServerFn`** in `src/lib/*.functions.ts` | **C** | Sono RPC su URL relativi. Dentro l'app l'origin è locale: va configurato un base URL assoluto (`https://pitcall.net`) e CORS lato server |
| Supabase JS (`src/integrations/supabase/client.ts`) | A | Chiamate REST/RPC, funzionano ovunque |
| Auth Supabase (email/password + Google via `lovable.auth.signInWithOAuth`) | B/C | Vedi §3: OAuth e redirect richiedono deep link |
| Sessione: `brokeredPreviewStorage` → localStorage | B | In WebView persiste, ma può essere ripulita dall'OS: consigliato storage nativo (Preferences) |
| Notifiche: tabella `notifications` + `/api/public/notification-email` + pg_cron | B | Architettura server-side già corretta, estendibile a push senza duplicare logica |
| Email (`notify.pitcall.net`, template React Email) | A | Interamente server-side |
| Matching engine (Postgres: `recompute_matches`, RPC, trigger) | A | Già tutto nel DB, zero logica nel browser |
| PWA / service worker | — | **Assenti** oggi: nessun conflitto da rimuovere |
| Leaflet + tile CARTO (`market-world-map.tsx`) | B | Ok, ma richiede rete e passa dal `ConsentGate` |
| iubenda script in `__root.tsx` | **C/D** | Un cookie banner web dentro l'app è inappropriato e va disattivato su piattaforma nativa (serve consenso in-app) |
| `xlsx` export, `window.open`, download file (admin) | B | In app va usato Filesystem/Share o si esclude l'admin |
| i18n (5 lingue, `i18next-browser-languagedetector`) | B | Va agganciato alla lingua di sistema del device |

**Verdetto §1:** sì, WEB + iOS + Android con un solo codebase è realistico. Il vero lavoro strutturale è uno solo: separare il "client bundle" dal "server" e puntare le server functions a un origin remoto.

## 2. Capacitor è la scelta giusta?

- **Capacitor** — sì, consigliato. Riusa il 100% di UI e logica, aggiunge push/deep link/lifecycle nativi, e non impone un rewrite.
- **PWA** — non basta: niente push affidabili su iOS in scenari reali, niente presenza sugli store (che è parte dell'obiettivo).
- **React Native / Expo** — richiederebbe di riscrivere l'intera UI: due prodotti da mantenere. Escluso.
- **Nativo separato** — triplica il lavoro. Escluso.

**Consiglio: Capacitor**, con backend, matching, DB e auth condivisi al 100%.

## 3. Authentication

Presente oggi: signup email/password con `emailRedirectTo`, Google OAuth con `redirect_uri: window.location.origin`, verifica email obbligatoria (`/verify-email`), reset password (`/forgot-password`, `/reset-password`), gate `_authenticated/route.tsx`, refresh token automatico.

Punti che dipendono dal browser e vanno adattati:
- `window.location.origin` come redirect: dentro l'app diventa `capacitor://localhost` → **non valido**. Serve deep link (`pitcall://auth/callback` o Universal Link su `pitcall.net`) registrato nei Redirect URL di backend.
- Google OAuth: va aperto in browser di sistema (SFSafariViewController / Custom Tabs) e non in WebView, altrimenti Google rifiuta il login.
- Link di conferma email e reset password: oggi puntano a URL web; devono diventare Universal Links che aprono l'app se installata.
- Persistenza sessione: consigliato storage nativo per evitare logout inattesi.
- **Requisito Apple**: se resta il solo Google come login social, Apple richiede anche **Sign in with Apple**. Da mettere in conto.

## 4. Push notifications

Oggi la logica di notifica vive nel DB (righe in `notifications`) e un worker cron manda le email leggendo le righe non ancora inviate. È **l'architettura giusta** per aggiungere push senza duplicare business logic.

Cosa servirebbe (non ora):
- tabella `device_tokens` (user_id, token, platform, is_test, last_seen) con RLS;
- estensione del dispatcher esistente: stessa riga `notifications` → in-app + email + push;
- FCM per Android, APNs (via FCM) per iOS + certificati/chiavi Apple;
- multi-device: un utente = N token; cleanup dei token invalidi restituiti dal provider;
- logout → revoca del token del device;
- badge: contatore già disponibile (`getUnreadNotificationCount`);
- payload push con `deeplink` per aprire la destinazione corretta.

**Isolamento Testing Lab:** l'attuale flag `is_test` va replicato sui device token e il dispatcher deve rifiutare l'invio incrociato test↔live. È una regola in più nel dispatcher, non un redesign.

**Invasività: bassa/media.** Nessuna modifica al matching o alle notifiche esistenti.

## 5. Deep linking

Riutilizzabile quasi tutto: i path esistono già (`/dashboard/requests/$id/matches`, `/dashboard/engagements`, `/dashboard/notifications`, `/reset-password`). Serve:
- `apple-app-site-association` e `assetlinks.json` su pitcall.net;
- custom scheme `pitcall://` come fallback per auth;
- un handler `appUrlOpen` che traduce l'URL in `router.navigate`.

## 6. Calendario freelance

`src/components/availability-calendar.tsx` usa react-day-picker con click su celle e azioni bulk. Compatibile con il touch, ma da verificare/adattare:
- dimensione dei tap target sulle celle su schermi piccoli (IMPORTANT);
- evitare selezione-testo e doppio-tap zoom durante il drag/selezione;
- safe area in basso per la barra azioni "conferma disponibilità";
- performance su range lunghi (stagione intera) — già un tema web, non introdotto da Capacitor.

**Non richiede riscrittura**, solo rifiniture mobile.

## 7. Pit Call e matching

Il motore vive interamente in Postgres (`recompute_matches`, trigger, RPC) e i client leggono i risultati. **Nessuna business logic critica nel browser.** Le app sarebbero semplicemente altri client. Unico punto da spostare/riconfigurare: le server functions TanStack (formattazione, gating token, geocode proxy) restano server-side ma vanno raggiunte via origin remoto.

## 8. Admin Control Panel e Testing Lab

**Consiglio: Admin → solo Web.** Le rotte `_authenticated/admin.*` (Testing Lab, wiki, export xlsx, impersonation) andrebbero escluse dal bundle mobile: riduce peso, rischio e superficie di review Apple (impersonation e strumenti interni sono spesso mal visti).

Testing Lab: l'architettura `is_test` esistente regge, a condizione di estenderla a device token e push, e di mantenere le email di test non realmente inviate. I deep link test devono restare nello stesso scope dell'ambiente.

## 9. Token e pagamenti (solo compliance, nessuna implementazione)

- **Apple**: se i token servono a sbloccare funzionalità *dentro l'app*, Apple può classificarli come contenuto digitale → obbligo di In-App Purchase (30%/15%) e divieto di link diretti al checkout esterno (salvo eccezioni per regione).
- **Google Play**: posizione analoga con Play Billing, con più tolleranza in UE.
- Argomento a favore dell'esenzione: PITCALL è un servizio B2B tra aziende e professionisti (categoria "reader"/B2B marketplace), ma non è garantito.

**Decisioni da prendere PRIMA della submission:** se i Team acquistano token solo via web (app mobile "read-only" sui token, nessun riferimento al prezzo né link al checkout) oppure se si implementa IAP su iOS. Questa scelta condiziona la UI della pagina token nelle app.

## 10. Foto profilo e logo Team (futuro)

Tecnicamente semplice: Supabase Storage + bucket privato + URL firmati funziona identico su web e Capacitor; la camera/photo picker è un plugin standard.

**Decisione architetturale da prendere già ora:** le immagini devono stare in un bucket **privato**, servite solo tramite URL firmato generato server-side dopo che l'identità è stata rivelata secondo il flusso PITCALL. Se si usasse un bucket pubblico, l'anonimato del matching sarebbe aggirabile. Questo va deciso al momento della creazione del bucket, non dopo.

## 11. Funzioni native realmente utili

- **NECESSARIA**: Push Notifications, Deep Links / Universal Links, App lifecycle (resume → refetch), Status/Splash + safe area, Preferences (sessione).
- **UTILE**: Badge, Network status, Browser in-app per OAuth e link esterni, Share (export/vCard).
- **SUPERFLUA PER V1**: Camera/Photos, Geolocation (oggi la location è testuale via Nominatim), Haptics, Biometria, calendario nativo.

## 12. UX mobile — problemi da verificare

- **BLOCKER**: redirect auth basati su `window.location.origin`; banner iubenda dentro l'app; back button Android non gestito; assenza di safe-area/notch handling; admin/export file inutilizzabili in app.
- **IMPORTANT**: tabelle admin/liste orizzontali molto desktop-centriche; dropdown e modali Radix con tastiera aperta; form lunghi (profilo, nuova Pit Call) e scroll dell'input a fuoco; tap target del calendario; `window.open` per link esterni; hover-only states.
- **NICE TO HAVE**: landscape, pull-to-refresh, transizioni di navigazione, mappa Leaflet su schermi piccoli.

## 13. Performance

**Introdotto da Capacitor:** avvio della WebView (cold start ~0.5–1.5s), nessun SSR quindi first paint interamente client-side, assenza di cache HTTP del browser.

**Già presente nella webapp:** bundle pesante (recharts, leaflet, xlsx, 5 locali caricati, tutta la suite Radix), liste admin senza virtualizzazione, polling notifiche ogni 15s, molte query Supabase in sequenza sulle dashboard.

Il passaggio a client-only rende questi problemi **più visibili**, non li crea. Rimedi: code splitting per route, escludere admin/xlsx/leaflet dal bundle mobile, locali caricati on-demand.

## 14. Offline (comportamento minimo)

Rilevare l'assenza di rete e mostrare un banner chiaro; retry manuale sulle query; cache in memoria di React Query per non svuotare le schermate; **il calendario resta read-only offline** — nessuna scrittura in coda, per non generare conflitti con la logica di freshness ed engagement.

## 15. Checklist store (cosa manca oggi)

Manca tutto il livello nativo, perché non esiste ancora:
- bundle ID (`net.pitcall.app`) e application ID; signing iOS (Apple Developer, certificati, provisioning) e Android (keystore);
- icone (tutte le dimensioni) e splash screen — oggi esiste solo `favicon.png`;
- privacy manifest Apple + Data Safety Google; descrizioni dei permessi (notifiche);
- **cancellazione account in-app** (obbligatoria Apple e Google) — oggi non presente lato utente;
- **Sign in with Apple** se resta Google — BLOCKER Apple;
- consenso privacy nativo al posto del banner iubenda — BLOCKER;
- account di test per i reviewer (freelancer + team, dati realistici, non ambiente test contaminante);
- posizione definita su token/IAP (§9) — potenziale BLOCKER Apple;
- privacy policy raggiungibile (già presente su pitcall.net).

## 16. Rischio "website wrapper"

Rischio **reale ma gestibile**. Il minimo sensato per essere valutata come vera app: push native funzionanti, deep link che aprono la destinazione giusta, badge, gestione lifecycle/back button, safe area e UI adattata, splash/icone curate, niente banner cookie web, niente sezioni admin. Con questo set PITCALL non è un wrapper: è un client nativo di un servizio con valore proprio.

## 17. Manutenzione dopo la pubblicazione

- **Automatico su tutti i client**: migrazioni DB, RPC, matching, RLS, `platform_settings`, costi token, email, contenuti.
- **Richiede rebuild + nuova submission**: qualsiasi modifica al frontend, perché il bundle web è impacchettato nell'app (a meno di adottare un meccanismo di live update, che va valutato a parte e ha vincoli Apple).
- **Richiede rebuild senza submission urgente**: nulla di significativo.
- **Compatibilità**: mantenere le RPC retro-compatibili (aggiungere campi, mai rimuoverli); una tabella `app_min_version` con schermata "aggiorna l'app" per forzare l'upgrade quando il backend rompe la compatibilità.

Il lavoro non triplica: raddoppia solo nella fase di release (build + store), non nello sviluppo.

## 18. Costi

- Capacitor e plugin ufficiali, FCM: gratuiti.
- Apple Developer Program: ~99 USD/anno. Google Play: 25 USD una tantum.
- Mac necessario per build iOS (o servizio CI cloud a pagamento).
- APNs/FCM: nessun costo per i volumi previsti.
- Ricorrenti: solo account developer + eventuale CI.
- Opzionali: servizio di live update, crash reporting.

## 19. Stima del lavoro

**MODERATE** (non SIMPLE per via del passaggio SSR → client-only e dei deep link auth; non COMPLEX perché backend e matching non si toccano).

- Phase 1 — Fondazione Capacitor: build client-only, origin remoto per le server functions, shell iOS/Android.
- Phase 2 — Auth & deep links: redirect nativi, OAuth in browser di sistema, Universal/App Links, Sign in with Apple.
- Phase 3 — Push: device token, estensione del dispatcher, isolamento test/live, badge.
- Phase 4 — Adattamenti mobile: safe area, back button, calendario, form, esclusione admin.
- Phase 5 — Compliance: consenso nativo, cancellazione account, privacy manifest, decisione token/IAP.
- Phase 6 — Testing su device reali con account TEST.
- Phase 7 — Submission.

## 20. Verdetto finale

1. **Sì**, PITCALL è tecnicamente adatta a Capacitor.
2. Riutilizzo stimato: **~90–95%** del codebase (100% di DB/matching, quasi tutta la UI).
3. **Sì**, un solo codebase Web/iOS/Android è realistico.
4. **Backend: modifiche minime** — CORS/origin, redirect URL, tabella device token, estensione dispatcher push. Matching e RLS intatti.
5. **Frontend: modifiche contenute ma non nulle** — build client-only, base URL delle server functions, deep link handler, safe area, back button, esclusione admin, consenso nativo.
6. Blocker principali: SSR → client-only, redirect auth basati su `window.location.origin`, banner iubenda in app, Sign in with Apple, cancellazione account, posizione su token/IAP.
7. **Sì**, l'architettura notifiche attuale (righe in DB + dispatcher) è già il modello corretto per aggiungere le push.
8. Auth compatibile **con adattamenti** (deep link + browser di sistema + storage nativo).
9. **Sì**: va deciso prima della submission se i token si comprano solo via web o via IAP.
10. Testing Lab compatibile, estendendo `is_test` a device token e push.
11. Attenzione a: calendario, form lunghi, tabelle/liste admin, modali e dropdown con tastiera, safe area, back button Android.
12. Complessivamente **MODERATE**.
13. **Sì, consiglio Capacitor** per questo progetto.
14. Nella V1 mobile **non** farei: admin panel e Testing Lab, foto/logo, camera, geolocalizzazione, offline reale, live update, IAP.
15. Percorso minimo e robusto: build client-only puntata al backend esistente → auth con deep link e Sign in with Apple → push native con isolamento test → rifiniture mobile e cancellazione account → decisione token/IAP → submission.

---

Nessuna implementazione eseguita. In attesa della tua approvazione per decidere se e come procedere.
