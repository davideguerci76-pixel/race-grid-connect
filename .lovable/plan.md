# Fix Pit Call "In my pool": badge lato team, conteggi match corretti, upgrade e layout a 2 colonne

## 1. Badge "In my pool" visibile al team

Oggi il badge esiste solo nell'Admin Control Panel. Va mostrato anche al team, accanto allo status, in:

- Lista "My Pit Calls" (`dashboard/requests`)
- Lista "Matches" (`dashboard/matches`, vista team)
- Header della pagina di dettaglio Pit Call

Si riusa il componente `PoolBadge` già esistente, guidato da `search_mode === "pool"` (campo già restituito da `getMyRequests`).

## 2. Conteggio match sbagliato nelle liste

Nella lista Matches la Pit Call pool dice "6" ma dentro se ne vede 1: il conteggio conta tutti i match della richiesta, mentre la pagina di dettaglio filtra correttamente sui soli membri del pool.

Fix in `getMyRequests`: per le richieste con `search_mode = 'pool'`, contare solo i match il cui freelancer appartiene al `team_pool` del team. In parallelo si restituisce anche `outside_pool_count` (i match esclusi), usato al punto 3.

Risultato: la card mostrerà "1" e non più "6".

## 3. Match fuori dal pool + upgrade a Standard

Nella pagina di dettaglio di una Pit Call pool, quando esistono match validi fuori dal pool, compare un box informativo:

- "Ci sono N ulteriori match fuori dal tuo pool"
- Pulsante "Upgrade to standard search" con il costo in token
- Costo = differenza tra costo Pit Call standard (10 weekend / 20 stagione) e costo pool (5), letti da `platform_settings`
- Conferma prima dell'addebito

L'upgrade converte la richiesta a `search_mode = 'standard'`, addebita la differenza, registra la transazione token e riporta la pagina alla modalità standard (tutti i match visibili con le regole di tier standard). I match già visibili del pool restano visibili in chiaro (i membri del pool mantengono il badge e i nomi in chiaro anche in modalità standard).

Se il saldo token non basta, il pulsante mostra l'errore di saldo insufficiente senza modificare nulla.

## 4. Layout sempre a due colonne

Oggi la vista a due colonne (Full / Partial) è applicata solo alle Pit Call pool; le standard usano il flusso a tutta pagina.

Si unifica: ogni Pit Call (standard e pool) usa la griglia a due colonne — colonna sinistra "Full matches", colonna destra "Partial matches" — con lo stesso comportamento dello screenshot 3 quando i parziali sono zero (placeholder "nessun match parziale"). Il banner FOMO sui parziali e i blocchi di sblocco per tier restano, spostati dentro la colonna corrispondente.

## Dettagli tecnici

- `src/lib/paddock.functions.ts`
  - `getMyRequests`: conteggio match filtrato sul pool per `search_mode='pool'`, aggiunta `outside_pool_count`.
  - `getRequestMatches`: aggiunta `outside_pool_count` e `upgrade_cost` nel payload di ritorno.
  - Nuova server fn `upgradeRequestToStandard` (auth, owner-check, calcolo differenza da `platform_settings`, addebito via RPC `credit_tokens` con `reason='request_post'`, update `search_mode='standard'`, `recompute_matches`).
- `src/routes/_authenticated/dashboard.requests.$id.matches.tsx`: rimozione del ramo `isPoolRequest ? ... : ...`, griglia a 2 colonne unica; box upgrade; badge nell'header.
- `src/routes/_authenticated/dashboard.requests.index.tsx` e `dashboard.matches.tsx`: `PoolBadge` accanto allo status.
- Nuove stringhe i18n (EN, IT, ES, FR, DE) per box upgrade e conteggio fuori pool.
- Nessuna modifica di schema DB necessaria.
