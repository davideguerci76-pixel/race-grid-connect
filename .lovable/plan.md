# PITCALL — Audit tecnico: PWA installabile + Web Push

Analisi sul progetto reale. Nessuna modifica applicata.

## Stato attuale verificato

- `public/` contiene solo `favicon.png`, `fonts/`, `robots.txt`: nessun manifest, nessun service worker, nessuna icona 192/512, nessun apple-touch-icon.
- Nessun riferimento a manifest/serviceWorker/vite-plugin-pwa nel codice o in `package.json`.
- `notifications` esiste già con `user_id`, `kind` (enum `notif_kind`), `payload` jsonb, `read_at`, `emailed_at`, **`is_test`**.
- Il dispatcher email è un endpoint pubblico (`/api/public/notification-email`) che cicla le notifiche con `emailed_at IS NULL` e mappa `kind → titolo + path` (`KIND_META`): la stessa mappa serve identica per le push.
- `getUnreadNotificationCount` / `getMyNotifications` / `markAllNotificationsRead` esistono già e sono la sorgente naturale del badge.
- Realtime su `notifications` già usato nella pagina notifiche.
- Hosting Lovable = HTTPS + dominio `pitcall.net` (requisito PWA soddisfatto).

## 1. Compatibilità PWA — voce per voce

| Punto | Stato | Nota |
|---|---|---|
| HTTPS | A | pitcall.net già HTTPS |
| Routing TanStack | A | nessun conflitto |
| Supabase Auth | A | localStorage funziona in standalone |
| Server functions / SSR / Nitro / Cloudflare | A | il SW intercetta solo navigazioni e asset hashati |
| Manifest | B | da creare |
| Icone (192/512/maskable/apple-touch) | B | da generare |
| display standalone / start_url / scope / theme+background color | B | campi del manifest |
| Service worker | C | generato con `vite-plugin-pwa` (`generateSW`), registrazione con guard anti-preview |
| Caching + auto-update | C | NetworkFirst su HTML, CacheFirst solo asset hashati, `registerType: autoUpdate` |
| iubenda | B | banner resta valido; push da dichiarare in policy |
| Notification architecture | C | estensione, non riscrittura |
| Blocker | — | **nessuno** |

## 2. Android

Fattibile al 100%: `beforeinstallprompt` permette un CTA reale "Installa PITCALL" in dashboard che:
- rileva Android, intercetta e memorizza l'evento, mostra il prompt nativo al click;
- rileva installazione già avvenuta (`display-mode: standalone` o evento `appinstalled`) e nasconde il CTA;
- apre in standalone con l'icona PITCALL.

Supportato: Chrome, Edge, Samsung Internet, Brave, Opera. Firefox Android non espone `beforeinstallprompt` → fallback con istruzioni testuali "Menu → Installa app".

## 3. iOS / iPadOS

Nessun prompt programmatico. Serve un CTA "Aggiungi PITCALL alla Home" che apre una scheda con istruzioni visive (Condividi → Aggiungi alla schermata Home → Aggiungi), rileva Safari iOS/iPadOS e si auto-nasconde quando `navigator.standalone` o `display-mode: standalone` è vero.

## 4. Web Push — fattibilità (priorità assoluta)

Realisticamente ottenibile su **Android (Chrome/Edge/Samsung/Firefox), iOS/iPadOS 16.4+ solo se installata sulla Home, desktop (Chrome/Edge/Firefox/Safari macOS 16+)**. Le push arrivano con app chiusa: le consegna il push service del sistema operativo, non il browser aperto.

Nessuna duplicazione di business logic: la sorgente resta il record `notifications`. Serve:
- tabella `push_subscriptions` (user_id, endpoint unique, p256dh, auth, user_agent, is_test, last_seen_at, created_at) con RLS owner-scoped + grant;
- colonna `pushed_at` su `notifications` (stesso pattern di `emailed_at`);
- coppia di chiavi VAPID (pubblica in env client, privata come secret server);
- endpoint `/api/public/notification-push` gemello di quello email, con lo stesso `KIND_META` estratto in modulo condiviso, chiamato dallo stesso pg_cron;
- firma VAPID Web Push compatibile Cloudflare Workers (Web Crypto, no librerie Node-only);
- cleanup automatico: endpoint che risponde 404/410 → subscription eliminata;
- multi-device nativo (una riga per endpoint);
- unsubscribe da UI preferenze + `pushManager.unsubscribe()`;
- preferenze notifiche estese con un canale `push` per kind.

## 5. iOS — specifiche

- iOS/iPadOS **16.4+**;
- **obbligatorio** aver aggiunto la PWA alla Home: in Safari normale `Notification.requestPermission` non è disponibile;
- il permesso va richiesto **dentro un gesto utente** (click su "Attiva notifiche"), mai all'avvio;
- funziona con app chiusa e Safari chiuso;
- si integra con Focus, Riepiloghi programmati e impostazioni notifiche di sistema;
- limiti rispetto al nativo: niente notifiche silenziose affidabili, niente background fetch, badge solo tramite Badging API, permesso negato = non ri-richiedibile in-app.

UX iOS corretta: STEP 1 "Aggiungi alla Home" → STEP 2 apri dalla Home → STEP 3 banner "Attiva notifiche" con beneficio esplicito. Il passo 3 viene mostrato solo in standalone.

## 6. Badge numerico

`navigator.setAppBadge(n)` / `clearAppBadge()`. Supportato su Android (Chrome installata) e iOS 16.4+ Home Screen Web Apps, oltre a desktop Chrome/Edge/macOS. Aggiornabile sia in-app (dal risultato di `getUnreadNotificationCount`, già esistente, più il canale realtime già attivo) sia dentro il service worker durante una push in background. Alla lettura delle notifiche il badge viene azzerato. Dove non supportato, chiamata dentro try/catch: miglioramento progressivo, nessun impatto.

## 7. Tap sulla push → deep link

Il payload push includerà `url` derivato da `KIND_META` (già mappato: engagements, calendar, notifiche) più gli id specifici per arrivare alla singola Pit Call/match. Nel `notificationclick` del SW: cerca un client PITCALL già aperto → `focus()` + `postMessage` con la rotta (il router TanStack naviga senza reload); se nessun client → `clients.openWindow(url)`. Se la sessione è scaduta, il gate `_authenticated` reindirizza a `/auth`; il path desiderato va conservato e ripristinato dopo il login (meccanismo di redirect da aggiungere, oggi non presente).

## 8. Aggiornamenti del sito

Con `registerType: "autoUpdate"`, HTML in NetworkFirst e cache solo sugli asset hashati: alla pubblicazione di una nuova versione l'utente riceve la build aggiornata al successivo avvio (o al massimo al secondo), senza reinstallare nulla. **Mai reinstallazione.** Nessun asset stale perché gli asset vecchi vengono rimossi dal precache al cambio versione. Opzionale un CTA discreto "Aggiornamento disponibile".

## 9. Autenticazione in PWA

Email/password, verifica email, reset password e persistenza sessione funzionano invariati in standalone. Il punto delicato è **Google OAuth su iOS standalone**: il flusso apre una view di sistema e il ritorno alla PWA va verificato in test reale; su Android il ritorno è affidabile. Il service worker non tocca le chiamate auth e non invalida la sessione (localStorage non è toccato dal SW).

## 10. Testing Lab TEST/LIVE

`notifications.is_test` esiste già. La tabella `push_subscriptions` avrà lo stesso flag, valorizzato con `env_is_test()` al momento della sottoscrizione. Il dispatcher push filtrerà `notifications.is_test = subscription.is_test`, e le notifiche TEST verranno soppresse esattamente come le email TEST: nessuna push TEST può raggiungere un device LIVE.

## 11. Privacy / iubenda

Il banner iubenda resta appropriato e invariato. Le Web Push non sono cookie ma un trattamento da dichiarare: privacy/cookie policy da aggiornare in iubenda (finalità "notifiche push", dati trattati = endpoint push + chiavi + user agent, conservazione fino a revoca). Il consenso push è il permesso di sistema del browser, non il banner: nessuna modifica a `ConsentGate`. Da prevedere la cancellazione delle subscription nel flusso di cancellazione account già esistente.

## 12. UX di attivazione

Dashboard → card discreta "Installa PITCALL — ricevi subito le nuove Pit Call sul telefono" → installazione → alla prima apertura standalone, banner singolo "Attiva le notifiche" → permesso richiesto solo al tap. Nessun popup automatico, nessun linguaggio tecnico, dismissibile e ricomparsa solo dopo lungo intervallo.

## 13. Performance

La PWA migliora lo startup a freddo (shell precachata) e non tocca le query Supabase, che restano sempre di rete. Nessun impatto su calendario, dashboard e matching. Il bundle cresce di pochi KB. I tempi di caricamento dati attuali non dipendono dalla PWA e restano tali.

## 14. Offline

Strategia minimale: shell disponibile, pagina/banner "Nessuna connessione", nessuna scrittura offline su calendario o Pit Call, retry alla riconnessione tramite React Query. Niente coda offline.

## 15. Costi

**Zero costi ricorrenti.** Web Push standard con VAPID parla direttamente con FCM/APNs/Mozilla senza provider a pagamento e senza infrastruttura aggiuntiva. Nessun Apple Developer Program, nessun account Google Play, nessun costo per volume.

## 16. PWA vs Capacitor

| Criterio | PWA + Web Push | Capacitor |
|---|---|---|
| Tempo sviluppo | giorni | settimane |
| Complessità | bassa | alta (2 progetti nativi) |
| Costi | 0 | 99 $/anno Apple + 25 $ Google + Mac |
| Manutenzione | una codebase | codebase + build nativi |
| Aggiornamenti | istantanei | review store |
| Push | sì (iOS 16.4+ se installata) | sì, più affidabili |
| Badge | sì dove supportato | sì |
| Installazione | Home Screen | store |
| Auth | invariata | deep link da riprogettare |
| Limiti iOS | richiede Home Screen, no push senza installazione | nessuno |

La PWA copre oggi la quasi totalità dei motivi che spingevano verso il nativo. Capacitor resta rilevante solo se serviranno pagamenti in-app, presenza negli store come canale di acquisizione o affidabilità push massima su iOS.

## 17. Stima: MODERATE

- Fase 1 — Manifest, icone, installabilità
- Fase 2 — Service worker (vite-plugin-pwa, guard preview, auto-update)
- Fase 3 — Tabella push_subscriptions + VAPID + subscribe/unsubscribe
- Fase 4 — Dispatcher push accanto al dispatcher email (KIND_META condivisa, `pushed_at`, cleanup 410, isolamento is_test)
- Fase 5 — Badging API sincronizzata con le notifiche non lette
- Fase 6 — UX di installazione Android + iOS e banner "Attiva notifiche"
- Fase 7 — Deep link da notificationclick + redirect post-login
- Fase 8 — Test su device reali (Android, iPhone 16.4+, desktop) e localizzazione 5 lingue

## 18. Verdetto

1. Sì, senza grandi modifiche. 2. Sì. 3. Sì, iOS 16.4+ e solo se aggiunta alla Home. 4. Sì, anche con app chiusa. 5. Sì. 6. Sì, dal conteggio non letti già esistente. 7. Sì. 8. No, mai reinstallazione. 9. MODERATE. 10. Nessun blocker tecnico; unico vincolo reale è l'obbligo iOS di installare la PWA prima delle push. 11. Zero costi ricorrenti. 12. No. 13. No. 14. Sì, per la V1. 15. Sì, è la soluzione mobile iniziale consigliata per PITCALL.
