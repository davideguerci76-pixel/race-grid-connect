# PITCALL — Sistema unificato di errori, feedback e fallback

## 1. Audit sintetico

**1.1 Branding Lovable visibile all'utente**
- Nessun logo o testo "Lovable" viene mostrato nella UI. Gli unici riferimenti sono tecnici e invisibili: `src/lib/lovable-error-reporting.ts` (telemetria), il prefisso interno `/lovable/` in `src/start.ts`, gli URL og:image su dominio r2/lovable.app in `__root.tsx`.
- Rischio reale: `src/lib/error-page.ts` — pagina HTML server-side (usata da `src/server.ts` e `src/start.ts` per errori SSR/500) con stile chiaro system-ui, fondo `#fafafa`, testo nero: **totalmente estranea al brand**. È la "pagina generica del builder" che l'utente può vedere.
- og:image punta a uno screenshot ospitato su dominio lovable.app → va sostituito con un asset PITCALL sul dominio proprio.

**1.2 Sistemi di toast/modal/errore oggi presenti**
- Toast: uno solo, `sonner` (34 file), ma `Toaster` è importato direttamente da `sonner` in `__root.tsx` invece che dal wrapper `@/components/ui/sonner`.
- Conferme: **22 punti** usano `window.confirm()` nativo del browser (admin users/teams/pitcalls/reviews/permissions, dashboard requests/matches/engagements/pool/index). Grafica browser, fuori brand.
- Dialog PITCALL: `ui/alert-dialog.tsx` e `ui/dialog.tsx` esistono ma non sono usati per le conferme distruttive.
- Error boundary: solo `__root.tsx` (`ErrorComponent` + `NotFoundComponent`, già in stile PITCALL ma minimale, senza logo né reference id); `legal.$doc`, `teams.$id`, `freelancers.$id` hanno fallback locali diversi tra loro. Nessun `defaultErrorComponent` / `defaultNotFoundComponent` nel router → le route con loader senza boundary mostrano il fallback di framework.
- Nessuna gestione offline/network (`navigator.onLine` non compare da nessuna parte).

**1.3 Errori raw mostrati all'utente**
- ~40 call site fanno `toast.error(e instanceof Error ? e.message : ...)`: mostrano il messaggio grezzo del server function/Postgres/Supabase (es. `new row violates row-level security policy`, `JWT expired`, `duplicate key value`).
- `auth.tsx` mostra `result.error.message` di Supabase Auth (es. "Invalid login credentials", "Email not confirmed") senza traduzione.
- Stringhe hardcoded in inglese: `"Error"`, `"Failed"`, `"Export failed"`, `"Generation failed"`, `"Purge failed"`, ecc. (verify-email, requests.new, privacy-data-section, admin.testing, admin-env-switch).
- 403/404 lato dati: nessuna schermata dedicata; RLS denial arriva come toast tecnico.

**1.4 Copertura per categoria**
- (A) coerente PITCALL: toast sonner, 404 root, error boundary root (parziale).
- (B) generico: `window.confirm` ×22, fallback route diversi tra loro.
- (C) branding estraneo: `error-page.ts` (server 500), og:image.
- (D) testo tecnico: ~40 toast + auth.
- (E) UX assente: offline, timeout, session expired, 403, push/install errors, service-worker failure, error reference id.

## 2. Cosa costruisco

**Nuovi moduli condivisi**
1. `src/lib/errors/normalize.ts` — mappa qualunque errore (Error, PostgrestError, AuthError, HTTP status, network failure) in `{ code, titleKey, messageKey, action }`. Riconosce: session expired/JWT, credenziali invalide, email non verificata, RLS/403, 404, conflitto/409, rate limit/429, timeout/offline, 500 generico. Nessun testo tecnico esce mai.
2. `src/lib/errors/report.ts` — logging separato dalla UI: genera un reference id `PC-XXXX`, fa `console.error` con errore reale + payload + route, e inoltra a `reportLovableError` (telemetria dev, non visibile).
3. `src/lib/errors/toast.ts` — `toastError(e, fallbackKey?)` e `toastSuccess(key)`: unico entry point per i feedback. Sostituisce tutti i `toast.error(e.message)`.
4. `src/components/feedback/pitcall-error-screen.tsx` — schermata errore brandizzata (logo cuffia, titolo, copy, `TRY AGAIN` / `BACK TO DASHBOARD` / `SIGN IN AGAIN`, `Error reference: PC-XXXX`). Varianti: `crash`, `not-found`, `forbidden`, `offline`, `session-expired`.
5. `src/components/feedback/confirm-dialog.tsx` — hook + componente basato su `ui/alert-dialog`, con variante `destructive` (bottone rosso PITCALL, Cancel neutro). Sostituisce i 22 `window.confirm`.
6. `src/components/feedback/offline-banner.tsx` — listener `online`/`offline`, banner PITCALL persistente + `TRY AGAIN`.

**Stile**: nessun nuovo token. Riuso `bg-background`, `border-border`, `text-muted-foreground`, `racing-red` per distruttivo/errore, e i token esistenti warning/success (li aggiungo in `styles.css` solo se mancanti, in oklch). Tipografia mono/uppercase già usata nel prodotto.

**Route/pagine toccate**
- `src/lib/error-page.ts` → riscritta in nero puro, font di sistema fallback, logo inline, copy PITCALL (è HTML statico server-side: nessuna dipendenza React).
- `src/router.tsx` → aggiunti `defaultErrorComponent` e `defaultNotFoundComponent`.
- `src/routes/__root.tsx` → `ErrorComponent`/`NotFoundComponent` sostituiti dalla nuova schermata; `Toaster` dal wrapper `ui/sonner`; montaggio `OfflineBanner`; og:image su asset PITCALL.
- `legal.$doc.tsx`, `teams.$id.tsx`, `freelancers.$id.tsx` → riuso schermata condivisa.
- Tutti i file con `toast.error(...message)` → `toastError(e, "chiave")`.
- File con `confirm(...)` → `useConfirm()`.
- `push-setup-card.tsx`, `install-app-card.tsx` → copy non tecnico per permessi negati / prompt non disponibile, con CTA "How to enable".
- `auth.tsx`, `reset-password.tsx`, `forgot-password.tsx`, `verify-email.tsx` → messaggi auth normalizzati.

**Localizzazione**: nuovo namespace `errors` in EN/IT/ES/FR/DE (`src/i18n/locales/{lang}.errors.json`), registrato in `src/i18n/index.ts` come gli altri sweep. Zero stringhe hardcoded residue nei punti toccati.

## 3. Verifiche richieste su logging e telemetria

### 3.1 Cosa fa oggi `reportLovableError` (verificato)
Il file è un wrapper di **8 righe utili**: chiama `window.__lovableEvents?.captureException?.(error, context, options)`.
- **Endpoint**: nessuno nel nostro codice. Non c'è `fetch`, nessuna URL, nessuna chiave. È una chiamata a un oggetto globale (`window.__lovableEvents`) che viene iniettato dal runtime dell'editor/preview Lovable. Se il global non esiste, la funzione è un **no-op silenzioso** (optional chaining).
- **Dati inviati oggi**: l'oggetto `Error` (message + stack), `source: "react_error_boundary"`, `route: window.location.pathname`, `boundary`. **Nessun** email, user_id, payload, dato di profilo o di Pit Call — a meno che non siamo noi a passarli nel `context`.
- **Dove gira**: solo client (`typeof window === "undefined"` → return). È usato in **un solo punto**: l'error boundary root. In produzione sul dominio pitcall.net il global normalmente non è presente, quindi non parte nulla; ma è un **canale opaco**: se domani l'infrastruttura lo iniettasse anche in produzione, gli errori partirebbero senza nostro controllo.
- **Necessario a PITCALL?** No. È esclusivamente telemetria/debug lato builder. Rimuoverlo non rompe nulla.

**Decisione proposta (non lo rimuovo, lo recinto):** `report.ts` espone dei *sink*. Il sink Lovable viene invocato **solo** quando l'ambiente non è LIVE, cioè `import.meta.env.DEV === true` **oppure** l'hostname è di preview (`*.lovable.app`), **e** solo con un payload minimo già sanitizzato (`{ code, referenceId, route }` + Error originale). Su `pitcall.net` / `www.pitcall.net` il sink Lovable non viene mai chiamato. Nessuna dipendenza opaca nel nuovo sistema: se il file venisse eliminato, `report.ts` continua a funzionare.

### 3.2 Politica di logging DEV/TEST vs LIVE
`report.ts` avrà due modalità, decise da `isLiveEnv()` (hostname produzione e non `import.meta.env.DEV`):

- **DEV / preview / TEST**: `console.error` con gruppo completo — errore originale, stack, route, reference id, codice normalizzato, e payload **solo** se il call site lo passa esplicitamente come `debugPayload` (parametro che in LIVE viene scartato prima di qualsiasi log).
- **LIVE**: una sola riga sanitizzata: `PITCALL [PC-A7F3K9] auth/session_expired @ /dashboard/matches`. Niente stack, niente payload applicativo, niente oggetto errore, niente dati personali. Un `sanitize()` centralizzato elimina comunque per chiave qualsiasi campo che matcha `token|password|secret|jwt|apikey|authorization|session|email|phone|vat`, e la route viene ridotta al **pattern** (`/dashboard/requests/:id/matches`) invece che all'URL con id reali.

### 3.3 Nessun testo tecnico può raggiungere la UI
Vincolo strutturale, non stilistico: `normalize()` restituisce **solo** `{ code, titleKey, messageKey, action, referenceId }` — nessun campo stringa libera. `PitcallErrorScreen`, `toastError` e i toast accettano **esclusivamente chiavi i18n**, quindi `.message`, `.details`, `.hint`, `.code` Postgres, stack e risposte raw non hanno alcun percorso verso il render. `e.message` viene letto solo dentro `normalize()` per fare pattern matching sul codice e poi scartato. Aggiungo una regola ESLint locale (o in mancanza un check testuale nella passata finale) che vieta `toast.error(...message)` per evitare regressioni future.

### 3.4 Error reference: generazione, registrazione, ricerca
- **Formato**: `PC-` + 6 caratteri base32 Crockford (niente I/L/O/U) da `crypto.getRandomValues` → ~1,07 miliardi di combinazioni. Es. `PC-A7F3K9`.
- **Generato** in `report.ts`, una volta per errore, prima di qualsiasi log o render.
- **Registrato in tre posti, in ordine di costo crescente:**
  1. console (sempre, con la sanitizzazione della 3.2);
  2. **ring buffer in `sessionStorage`** (`pitcall:errors`, ultimi 20 record: id, code, route pattern, timestamp). Sopravvive al refresh e alla navigazione, si azzera alla chiusura della scheda. Serve al supporto per farsi dettare gli ultimi id;
  3. **tabella `client_error_log`** (opzionale ma raccomandata, altrimenti in LIVE il codice resta cosmetico): `reference_id`, `code`, `route_pattern`, `user_id` (nullable), `created_at`, `env` (LIVE/TEST). **Nessun** message, stack o payload. Insert consentito a `authenticated` e `anon`, SELECT solo admin via `has_role`. Scrittura best-effort, fire-and-forget, con throttling client (max 5 eventi/minuto) per non creare rumore o vettore di spam.
- **Ricerca**: campo di ricerca per reference id nell'Admin Control Panel (piccola sezione dentro la pagina admin esistente) che interroga `client_error_log`. Senza il punto 3, la ricerca esiste solo per DEV/TEST via console — te lo segnalo chiaramente perché è la differenza tra un codice utile e uno decorativo.
- **Sproporzione?** No: una tabella a 6 colonne, una policy, un input di ricerca. Nessun servizio esterno, nessun APM, nessun costo ricorrente.

**Ti chiedo una conferma sul punto 3.4.3** (creazione di `client_error_log`): è l'unico elemento del piano che tocca il database. Se preferisci, parto senza e il reference id resta correlabile solo via console/sessionStorage.

## 3bis. Separazione UI / log (sintesi)
- UI: solo chiavi i18n del namespace `errors` + reference id.
- Log: `report.ts`, con le due modalità sopra. Nessun servizio esterno aggiuntivo.


## 4. Rischi
- Toccare ~45 file: rischio di regressioni di compilazione più che logiche. Le modifiche sono solo di presentazione; nessuna mutation, query, RPC o flag viene alterata.
- Sostituire `window.confirm` (sincrono) con dialog asincrono richiede piccoli refactor dei click handler nei file admin/dashboard: la logica invocata resta identica.
- Messaggi meno specifici in admin: mantengo il reference id visibile agli admin per il debug.

## 5. Piano di esecuzione
1. Namespace i18n `errors` (5 lingue) + registrazione.
2. `normalize.ts`, `report.ts`, `toast.ts`.
3. `PitcallErrorScreen`, `ConfirmDialog`/`useConfirm`, `OfflineBanner`.
4. Riscrittura `error-page.ts` + router defaults + `__root.tsx`.
5. Sweep dei ~40 `toast.error` e dei 22 `confirm`.
6. Auth / PWA / push copy.
7. Verifica build e passata visiva sulle schermate chiave.

Nessuna modifica a matching, calendario, token, notifiche, RLS, Testing Lab, PWA core, auth flow (solo presentazione errori), splash o icone.
