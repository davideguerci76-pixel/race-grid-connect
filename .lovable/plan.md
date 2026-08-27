# PITCALL — PWA + Web Push: soluzione tecnica definitiva (v2)

Aggiornamento del piano precedente sui tre punti richiesti. Nessuna modifica applicata.

## Stato verificato (rilevante per queste tre correzioni)

- `env_is_test()` è già server-side e non si fida del browser: un account con `profiles.is_test = true` **vive sempre in TEST**, qualunque cosa chieda; un admin vede l'ambiente scelto in `admin_env_state`. Tutte le tabelle applicative hanno `is_test` con RLS `is_test = env_is_test()`.
- `notifications` ha già `is_test`, `read_at`, `emailed_at`, `payload`, enum `notif_kind`.
- L'impersonation esistente (`adminImpersonateUser`) genera già un **magic link Supabase one-time** via `generateLink({type:'magiclink'})`, con `assertAdmin` + `logAdminAction`. È esattamente il mattone giusto da riusare per il login su altro device — oggi però non ha vincolo TEST e apre solo una tab sullo stesso browser.
- Dispatcher email = endpoint pubblico con secret, ciclo su `emailed_at IS NULL`, mappa `KIND_META` kind → titolo + path.

---

## 1. Architettura definitiva push TEST/LIVE

Regola: **una push non attraversa mai il confine di ambiente**, e il confine è deciso dal database, non dal client.

- `push_subscriptions.is_test` **non viene mai inviato dal browser**. Viene valorizzato da un trigger/default `public.env_is_test()` al momento dell'INSERT: se l'utente è TEST, la subscription è TEST per costruzione; se è LIVE, è LIVE. Un client malevolo che invia `is_test: true` viene ignorato (colonna forzata dal trigger, come `tg_inherit_env` già fa per le altre tabelle).
- RLS su `push_subscriptions`: `auth.uid() = user_id AND is_test = env_is_test()`.
- Il dispatcher seleziona le subscription con **join esplicito sull'ambiente**: `notifications.is_test = push_subscriptions.is_test AND notifications.user_id = push_subscriptions.user_id`. Non c'è alcun percorso che possa incrociare gli ambienti, nemmeno per errore di query, perché la condizione è nella clausola di selezione, non in un filtro applicativo opzionale.
- **Le push TEST non vengono soppresse**: vengono inviate realmente, ma solo verso subscription TEST. È così possibile il debug end-to-end reale richiesto.
- Le notifiche TEST recapitate portano un marcatore visibile nel titolo (`[TEST]`) e `data.env = "test"`, così sul telefono è sempre evidente di che ambiente si tratta.
- `purge_test_environment()` va esteso per cancellare anche le `push_subscriptions` TEST.

Diagramma:

```text
evento TEST  → notification(is_test=true)  → subscriptions(is_test=true)  → push "[TEST] ..."
evento LIVE  → notification(is_test=false) → subscriptions(is_test=false) → push normale
                              ^ nessun percorso incrociato: vincolo in query + RLS
```

## 2. "Login on another device" — soluzione consigliata

**QR code che contiene un magic link Supabase one-time, generato server-side, ristretto agli account TEST.**

È la soluzione più sicura *e* più semplice perché non introduce un secondo sistema di autenticazione: riusa il flusso già presente e già collaudato (`generateLink` di Supabase), che è per sua natura single-use e scaduto in pochi minuti. Nessuna password viene letta, mostrata, salvata o indebolita: Supabase non le espone nemmeno all'admin.

Nuova server fn `adminTestLoginLink`:
1. `assertAdmin` (già esistente);
2. lettura server-side di `profiles.is_test` del target → **se `false`, errore immediato**;
3. `generateLink({ type: 'magiclink', email, options: { redirectTo: <origin>/dashboard } })`;
4. `logAdminAction(..., 'test_login_link', { email })`;
5. ritorno del solo `action_link`, mai la password, mai il token di servizio.

Il QR viene generato **client-side** dall'URL restituito (libreria QR leggera), quindi il link non transita in nessun servizio esterno. Nessuna nuova tabella: la scadenza e il single-use sono già gestiti dal token OTP di Supabase; conviene però abbassare l'OTP expiry a 5-10 minuti oppure accettare il default configurato del progetto.

Restano **entrambi** i bottoni, come suggerito:
- **"Open test user on this device"** → comportamento attuale, nuova tab desktop;
- **"Login on another device"** → modale con QR + link copiabile + countdown di scadenza.

## 3. Perché è impossibile usarlo su account LIVE

Quattro barriere indipendenti, tutte server-side:
1. la server fn richiede una sessione admin verificata (`requireSupabaseAuth` + `assertAdmin`), non un flag del browser;
2. `profiles.is_test` del target viene letto **dal database**, non ricevuto in input; se è `false` la funzione esce prima di generare qualsiasi link;
3. l'input è solo un `user_id`: non c'è nessun parametro che il chiamante possa manipolare per aggirare il controllo;
4. ogni generazione è scritta in `admin_audit_log`, quindi non esiste uso silenzioso.

In più, opzionalmente, un flag `platform_settings.testlab_device_login_enabled` permette di spegnere globalmente la feature in produzione.

## 4. UX nel Testing Lab

```text
Testing Lab → tabella utenti TEST → riga utente
  [ Open on this device ]   [ Login on another device ]
                                   ↓
                    ┌───────────────────────────────┐
                    │  QR grande                    │
                    │  utente: mario.test@…         │
                    │  scade tra 09:41              │
                    │  [ Copia link ]  [ Rigenera ] │
                    │  uso singolo — dopo la        │
                    │  scansione non è più valido   │
                    └───────────────────────────────┘
```
Scansione con la fotocamera → si apre PITCALL nel browser mobile → sessione TEST attiva → da lì "Aggiungi alla Home" → riaprire dalla Home → "Attiva notifiche".

## 5. Interazione con Supabase Auth

Il magic link crea una sessione Supabase normale e completa: `session persistence` in localStorage identica a un login standard, refresh token regolare, logout normale. Nessuna differenza per il gate `_authenticated` né per il bearer attacher. Il link è consumato al primo uso; una seconda scansione fallisce.

**Nota importante sull'ordine dei passi in iOS**: la sessione ottenuta nel browser Safari **non** viene ereditata dalla PWA aggiunta alla Home, che ha uno storage separato. Sequenza corretta su iPhone: aggiungi PITCALL alla Home → apri dalla Home → **scansiona/apri il magic link da dentro la PWA** (o incolla il link) → sessione TEST dentro la PWA → attiva notifiche. Il QR va quindi accompagnato dal link copiabile proprio per questo caso.

## 6. Comportamento della push subscription dell'utente TEST

Una volta autenticato come utente TEST nella PWA, alla concessione del permesso viene creata una subscription con `is_test = true` forzato dal database. Da quel momento il device riceve **solo** push TEST. Al cambio account sullo stesso device: al logout la subscription viene disiscritta e la riga eliminata; al nuovo login viene creata una riga nuova con l'ambiente del nuovo utente. Se una riga orfana sopravvivesse, il vincolo `notifications.is_test = subscription.is_test` più `user_id` impedisce comunque qualunque consegna incrociata (l'endpoint è legato all'utente, non solo al device).

## 7. Delivery multi-device e retry — soluzione definitiva

`notifications.pushed_at` da solo **non è sufficiente**: è un flag per-notifica, quindi non sa distinguere iPhone consegnato da Android fallito. O blocca il retry di Android, o lo consente duplicando la push su iPhone. Lo scenario dei tre device che hai descritto è esattamente il caso che rompe l'ipotesi semplice.

Soluzione minima, senza overengineering — una sola tabella di delivery:

`push_deliveries`
- `notification_id`, `subscription_id` → **UNIQUE insieme** (questa è l'idempotenza: un solo tentativo riuscito per coppia, nessun duplicato possibile nemmeno con dispatcher concorrenti o crash a metà invio);
- `status` (`pending` / `sent` / `failed` / `gone`), `attempts`, `last_error`, `last_attempt_at`, `is_test`.

Comportamento:
- il dispatcher prende le coppie notifica × subscription non ancora in stato `sent`/`gone`;
- successo → `sent` (mai più ritentata: iPhone non riceve doppioni);
- errore temporaneo (5xx, timeout) → `failed` + `attempts++`, ritentata al giro successivo fino a un massimo (es. 3), con la finestra temporale già usata dalle email (notifiche più vecchie di 48h non vengono più ritentate);
- **404/410** → subscription marcata `gone` e riga in `push_subscriptions` **eliminata**: cleanup automatico degli endpoint scaduti;
- `notifications.pushed_at` resta comunque utile come marcatore "fan-out già pianificato", ma non è più il criterio di consegna.

**Retention**: `push_deliveries` cresce con notifiche × device, quindi cleanup periodico nello stesso cron — cancellazione delle righe più vecchie di 30 giorni in stato terminale (`sent`/`gone`) e di tutte le righe TEST più vecchie di 7 giorni. Indici su `(notification_id)` e su `(status, last_attempt_at)` per mantenere la query del dispatcher costante.

## 8. Nuove tabelle / colonne / RPC / API

**Tabelle**
- `push_subscriptions` (user_id, endpoint UNIQUE, p256dh, auth, user_agent, is_test, last_seen_at, created_at) — grant `authenticated` + `service_role`, RLS owner-scoped + ambiente, `is_test` forzato da trigger.
- `push_deliveries` (notification_id, subscription_id, UNIQUE coppia, status, attempts, last_error, last_attempt_at, is_test) — accesso solo `service_role`, nessuna lettura client.

**Colonne**
- `notifications.pushed_at` (marcatore di fan-out, non di consegna).

**RPC / server fn**
- `savePushSubscription` / `deletePushSubscription` (autenticate, ambiente dal DB);
- `adminTestLoginLink` (admin + solo target TEST);
- estensione di `purge_test_environment()` alle subscription e delivery TEST.

**API**
- `/api/public/notification-push`, gemello di quello email, stesso secret, chiamato dallo stesso pg_cron; `KIND_META` estratta in modulo condiviso e riusata da entrambi i canali.

## 9. Impatto sicurezza

Positivo o neutro. Il login su altro device non aggiunge una nuova superficie di attacco rispetto all'impersonation già esistente: la restringe (solo TEST) e la traccia. Nessuna password letta o memorizzata. Le chiavi VAPID private restano secret server-side. `push_deliveries` non è leggibile dal client. Il rischio residuo da presidiare è la compromissione di un account admin, che però già oggi consentirebbe l'impersonation completa: il vincolo TEST rende questa specifica funzione meno pericolosa dell'esistente, non di più.

## 10. Impatto performance / database

Trascurabile. Il dispatcher gira già in cron: aggiunge una join e N richieste HTTP per notifica, dove N = device dell'utente (tipicamente 1-3). `push_subscriptions` resta piccola (ordine dei device attivi). `push_deliveries` è la sola in crescita, contenuta dalla retention a 30 giorni. Nessun impatto su matching, calendario o dashboard.

## 11. Edge case non ancora considerati

- **iOS: storage separato tra Safari e PWA** — la sessione del magic link non passa alla PWA; da qui l'ordine dei passi al punto 5 e il link copiabile accanto al QR.
- **Permesso negato su iOS**: non è più ri-richiedibile in-app; serve un testo che spieghi il percorso nelle impostazioni di sistema.
- **Disinstallazione della PWA**: la subscription non viene revocata esplicitamente; verrà pulita al primo 410.
- **Stesso device, due utenti TEST diversi**: l'endpoint push è unico per installazione, quindi va gestito l'aggiornamento del `user_id` sulla riga esistente invece di un secondo insert (l'UNIQUE su endpoint lo impone).
- **Admin che è anche un account reale**: se un admin genera un link per sé stesso il flusso è bloccato, come già oggi nell'impersonation.
- **Cambio di chiavi VAPID**: invalida tutte le subscription esistenti; da fissare una volta e non ruotare senza un reset pianificato.
- **Ora legale / notifiche duplicate da retry cron sovrapposti**: risolto dall'UNIQUE su `push_deliveries`.
- **Il tap sulla push con sessione scaduta** deve conservare il path e ripristinarlo dopo login: meccanismo di redirect oggi non presente, da aggiungere.

## 12. Piano PWA aggiornato

Tutto il resto del piano precedente resta valido (manifest, icone, service worker con `vite-plugin-pwa` e auto-update, installazione Android/iOS, badge, deep link, offline minimale, iubenda, costi zero, verdetto PWA-prima-di-Capacitor). Fasi aggiornate:

- Fase 1 — Manifest, icone, installabilità
- Fase 2 — Service worker (auto-update, guard preview)
- Fase 3 — `push_subscriptions` + VAPID + subscribe/unsubscribe (ambiente forzato dal DB)
- Fase 4 — `push_deliveries` + dispatcher push per-subscription con retry, cleanup 410 e retention
- Fase 5 — Badging API sincronizzata con le notifiche non lette
- Fase 6 — UX installazione Android/iOS + banner "Attiva notifiche"
- Fase 7 — Deep link da `notificationclick` + redirect post-login
- Fase 8 — **Testing Lab: "Login on another device" con QR** + flusso end-to-end TEST
- Fase 9 — Test su device reali e localizzazione 5 lingue

Stima complessiva invariata: **MODERATE**.
