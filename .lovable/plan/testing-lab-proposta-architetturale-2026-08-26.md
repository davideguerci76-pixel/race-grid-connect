# Testing Lab — Proposta architetturale

## 1. La soluzione scelta: flag `is_test` sull'account + scope di sessione lato database

Ogni account PITCALL nasce già da `profiles` (che referenzia l'utente auth) e **tutto il resto del database dipende da un account**: `freelancer_profiles`, `team_profiles`, `availability`, `user_calendars`, `requests`, `matches`, `engagements`, `ratings`, `notifications`, `token_transactions`, `team_pool`, `sos_calls`, ecc.

Quindi l'ambiente si definisce in un solo punto:

```text
profiles.is_test = false  -> account LIVE   (tutti gli utenti reali)
profiles.is_test = true   -> account TEST   (solo generati dal Testing Lab)
```

Tutte le tabelle figlie ereditano l'ambiente dal loro proprietario. Sulle tabelle "calde" per il matching (`requests`, `matches`, `availability`, `engagements`) si denormalizza una colonna `is_test` mantenuta da trigger, così i filtri restano indicizzati e veloci.

L'isolamento **non** vive nel frontend. Vive in due meccanismi SQL:

1. **Scope di sessione**: una funzione `public.env_is_test()` che restituisce l'ambiente attivo del chiamante:
   - utente normale -> sempre `false` (LIVE), qualunque cosa mandi al backend;
   - admin -> valore salvato nella nuova tabella `admin_env_state(admin_id, is_test)`, cambiato solo dal selettore del pannello.
   Tutte le policy RLS esistenti vengono estese con `AND is_test = public.env_is_test()`. Anche una chiamata API diretta, un bug del frontend o un client con token valido non possono vedere l'altro ambiente.

2. **Barriera di contaminazione**: trigger `BEFORE INSERT/UPDATE` su `requests`, `matches`, `engagements`, `team_pool`, `ratings` che rifiutano qualsiasi riga in cui freelance e team non appartengano allo stesso ambiente. Anche `recompute_matches` filtra per ambiente. Un match TEST↔LIVE diventa impossibile a livello di database.

Le funzioni admin che usano il service role (che bypassa RLS) applicano lo stesso filtro esplicitamente, leggendo l'ambiente attivo dell'admin dal database — non da un parametro inviato dal browser.

### Perché questa soluzione e non le alternative

| Alternativa | Perché no |
|---|---|
| Secondo progetto/database di test | Deriva costante fra gli schemi, doppie migrazioni, "Login as User" e le email non funzionerebbero uguali, costo doppio. Rompe il principio "stesso codice, stesso motore". |
| Schema `test` separato nello stesso DB | Duplicazione di ~30 tabelle, di tutte le RPC e di tutti i trigger: due percorsi di codice, esattamente ciò che vuoi evitare. |
| Colonna `environment text` | Più flessibile in teoria, ma con soli due valori costa più spazio e indici meno efficienti di un boolean; `is_test` è anche autoesplicativo nei log. Se in futuro servissero più ambienti si può migrare a enum senza cambiare l'architettura. |
| Isolamento solo nel frontend | Non sicuro: basta una chiamata diretta all'API per mescolare i dati. |

### Vantaggi
- Un solo codebase, una sola RPC per funzione, un solo motore di matching: i risultati in TEST sono identici a quelli in LIVE.
- Isolamento garantito dal database, non dalla UI.
- Gli utenti reali non vedono nulla e non subiscono rallentamenti (indici parziali `WHERE is_test = false`).
- Cancellare l'ambiente TEST è un'unica operazione a cascata.

### Svantaggi e criticità future
- Ogni nuova tabella dovrà ricordarsi il filtro d'ambiente: lo mitighiamo con una convenzione documentata nel Wiki admin e con un test di regressione che elenca le tabelle prive di filtro.
- I dati di test vivono nel database di produzione: pesano sul disco e vanno cancellati periodicamente (il pulsante Delete lo rende immediato).
- Statistiche di mercato, conteggi pubblici e sitemap devono escludere `is_test = true` in modo esplicito (previsto nel piano).
- Gli account TEST occupano righe reali in auth: le email useranno un dominio non instradabile per non poter mai ricevere posta.

## 2. Cosa costruiamo

### Database
- `profiles.is_test` (default false) + colonna denormalizzata su `requests`, `matches`, `availability`, `engagements`, `user_calendars`, `notifications`, `token_transactions`.
- `admin_env_state`: ambiente attivo per ciascun admin.
- Funzioni `env_is_test()`, `admin_set_env(_is_test)`, `purge_test_environment()`.
- Aggiornamento delle policy RLS esistenti con il filtro d'ambiente e trigger anti-contaminazione.
- Indici parziali per non degradare le query LIVE.

### Sicurezza in ambiente TEST
Nessuna email, notifica push, webhook o pagamento reale: il dispatcher email salta le righe con `is_test = true` e i target esterni vengono registrati in un log invece che eseguiti. La "Coming Soon"/launch control resta invariata.

### Nuova sezione Admin: `/admin/testing`
Modulare, pensata per crescere: ogni strumento è un pannello indipendente registrato in un elenco.
- **Environment Switch** (LIVE / TEST) nella testata del pannello admin.
- **Barra rossa fissa** in cima all'interfaccia quando l'ambiente è TEST: "TEST ENVIRONMENT — Real users are hidden. You are working only on test data."
- **Dataset Generator**: preset Small (20/5), Medium (100/20), Large (500/100), Stress (1000/250) + Custom; distribuzione geografica Italy / Europe / Worldwide; Matching Density Sparse / Normal / Dense.
- **Delete TEST Environment** con doppia conferma.
- Slot già predisposti per futuri strumenti (benchmark matching, regressioni, analisi statistiche).

### Generatore procedurale (nessuna AI)
Tabelle di coerenza costruite sulla tassonomia reale del progetto (`src/lib/paddock.ts`): macro-ruolo -> sotto-ruoli -> seniority -> skill plausibili -> discipline -> tariffa coerente con seniority e disciplina -> lingue coerenti con il Paese -> città reali con coordinate. Un Race Engineer WEC senior e un Junior Mechanic di karting risultano profili diversi in tariffa, esperienza, skill e disponibilità.

Calendari: cinque archetipi realistici (quasi sempre disponibile, stagionale, molto impegnato, disponibilità limitata, piena disponibilità) distribuiti in proporzioni diverse secondo la Matching Density, con weekend gara e finestre di test coerenti con il calendario motorsport.

Team: dimensione, disciplina, Paese e anno di fondazione coerenti fra loro. Pit Call generate con ruolo, disciplina, date, durata, lingue e requisiti coerenti con il team che le pubblica.

Nessun pulsante "genera match": i match nascono dai trigger esistenti, esattamente come in LIVE.

### Riconoscibilità dei dati TEST
Email `tst-<codice>@test-pitcall.invalid`, display name con prefisso `[T]`, Pit Code dedicato e badge TEST nelle tabelle admin.

### Login as User
La funzione esistente resta invariata e funziona sugli account TEST: impersonando un team di test si può creare manualmente una Pit Call e vedere il motore di matching lavorare davvero.

## 3. Suggerimenti migliorativi (opzionali, valutabili dopo)
- Scadenza automatica: purge dei dataset TEST più vecchi di N giorni.
- Snapshot/ripristino di un dataset per riprodurre un bug identico più volte.
- Pannello "Matching Benchmark" con tempi di esecuzione e distribuzione dei punteggi.

## 4. Ordine di implementazione
1. Migrazione DB: colonne, `env_is_test()`, RLS, trigger, indici.
2. Filtro d'ambiente nelle funzioni server admin e nelle statistiche pubbliche.
3. Environment Switch + barra TEST.
4. Motore di generazione procedurale + route `/admin/testing`.
5. Purge dell'ambiente TEST.
6. Traduzioni nelle 5 lingue e verifica end-to-end (dataset -> Pit Call -> match -> ingaggio -> rating -> purge).
