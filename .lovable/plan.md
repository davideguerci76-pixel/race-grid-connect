# Analisi tecnica — Calendario freelance & Calendar Freshness

Nessuna modifica effettuata. Solo lettura di codice e database.

## 1. Struttura attuale del calendario

Tabella `public.availability`:
- `id uuid PK`, `freelancer_id uuid` (FK → `profiles.id`, ON DELETE CASCADE), `day date`, `created_at timestamptz DEFAULT now()`, `is_test boolean`.
- **Un record = un singolo giorno disponibile.** Nessun intervallo, array o JSON.
- Constraint: `UNIQUE (freelancer_id, day)`. Indici: `availability_day_idx (day)`, indice parziale su `is_test`.
- Trigger: `availability_bump_freshness` (AFTER INSERT OR DELETE → `tg_bump_calendar_freshness`), `availability_recompute` (AFTER INSERT/UPDATE/DELETE → `tg_recompute_on_availability` → `recompute_matches`), `trg_env_availability` (isolamento LIVE/TEST).

Stati delle date — **non esiste una colonna di stato**:
- AVAILABLE = riga presente in `availability`.
- non disponibile = assenza di riga (default).
- BOOKED/ENGAGED = **non persistito**: calcolato a runtime in TypeScript da `getMyBlockedDates` (`src/lib/paddock.functions.ts`) espandendo gli `engagements` con status `confirmed`/`completed` (usa `season_dates` della request quando presente).

Incongruenza rilevata: la UI (`dashboard.calendar.tsx`) sottrae i giorni "blocked" dai giorni selezionabili, ma **il motore di matching non conosce gli engagement**: in `recompute_matches` l'overlap è calcolato solo con `EXISTS(... FROM availability ...)`. Se una riga di availability rimane su un giorno già ingaggiato, quel giorno continua a generare match → possibile doppio booking a livello motore. Nessun trigger cancella l'availability alla conferma di un engagement.

Nessuna distinzione persistita tra "inserito manualmente" e "occupato da engagement". Nessuna gestione conflitti oltre alla UNIQUE.

Percorso del dato:
```text
UI calendario (dashboard.calendar.tsx)
 → serverFn setAvailability (upsert onConflict freelancer_id,day | delete .in(day))
 → tabella public.availability
 → trigger availability_bump_freshness  → freelancer_profiles.calendar_last_updated_at = now()
 → trigger availability_recompute       → recompute_matches(freelancer, NULL)
 → tabella public.matches (skills_score / final_score) → letta da getMyMatches / getRequestMatches
```

## 2. Tracciamento temporale esistente

- `availability.created_at` — timestamp **per singolo giorno**, valorizzato all'inserimento. Poiché le modifiche sono sempre INSERT o DELETE (mai UPDATE della riga), rappresenta di fatto "quando quel giorno è stato dichiarato disponibile l'ultima volta". Nessun `updated_at` sulla riga.
- `freelancer_profiles.calendar_last_updated_at` — timestamp **globale del calendario**. Aggiornato da: (a) trigger su INSERT/DELETE di availability, (b) RPC `confirm_calendar`. NB: il trigger non copre UPDATE (irrilevante oggi).
- `freelancer_profiles.updated_at` — generico profilo, aggiornato anche da `confirm_calendar`.
- Non esistono `confirmed_at`, `last_confirmed_at`, `availability_updated_at`.

Azione "Conferma calendario" (`confirmMyCalendar` → RPC `confirm_calendar`): imposta `calendar_last_updated_at = now()` e `updated_at = now()` sul profilo, poi chiama `recompute_matches(uid, NULL)`. Non tocca `availability`, non registra alcuno storico, **conferma l'intero calendario** (nessun mese/intervallo).

Distinzione attuale: "visualizzato" = nessuna scrittura (l'apertura pagina non modifica nulla); "modificato una data" = bump implicito del timestamp globale (indistinguibile da una conferma esplicita); "confermato" = stessa colonna. **Conferma e modifica sono indistinguibili nel DB.**

## 3. Calendar Freshness attuale

Unica logica reale: CTE `parts` dentro `public.recompute_matches`, campo `fresh_s`, alimentato da `fp.calendar_last_updated_at` e dal peso `matching_weights.calendar_freshness_weight`. Copertura globale (tutto il calendario, non per data). Nessun meccanismo di esclusione dal matching. Logiche collaterali (non duplicati del calcolo):
- `emit_calendar_stale_notifications()`: notifica `calendar_stale` se `calendar_last_updated_at < now-30d`, deduplica su 30 giorni, usa `sim_now()`.
- `missing_criteria` include il chip `calendar_stale` quando `fresh_s < calendar_freshness_weight`.
- UI di sola lettura: `dashboard.calendar.tsx` e `freelancers.$id.tsx` ricalcolano in TS le soglie 30/90 giorni **solo per il colore** (verde/giallo/rosso) — soglie hardcoded lato client, disallineate rispetto alle tre fasce del motore.

## 4. Impatto reale sul matching (formula vera)

```sql
CASE
  WHEN f_cal_updated IS NULL                          THEN 0
  WHEN f_cal_updated > now() - interval '30 days'     THEN calendar_freshness_weight
  WHEN f_cal_updated > now() - interval '90 days'     THEN calendar_freshness_weight * 0.5
  WHEN f_cal_updated > now() - interval '180 days'    THEN calendar_freshness_weight * 0.25
  ELSE 0
END AS fresh_s
```
Con il peso attuale (`matching_weights.calendar_freshness_weight = 4`):
- < 30 giorni = 100% = **4.00 punti**
- 30–89 giorni = 50% = **2.00 punti**
- 90–179 giorni = 25% = **1.00 punto**
- >= 180 giorni = 0% = **0 punti** (il freelance resta comunque nei match)

Composizione: `skills_score = LEAST(100, ROUND(subrole_s + skills_s + disc_s + rate_s + langs_s + edu_s + loc_s + fresh_s, 2))`, poi `final_score = GREATEST(0, skills_score − penalità giorni mancanti)`.

Risposte puntuali: (1) `calendar_last_updated_at`; (2) "confirmation" = qualunque bump di quel timestamp, quindi anche una semplice aggiunta/rimozione di un giorno; (3)(4)(5) come sopra; (6) sì, oltre 180 giorni resta pienamente incluso; (7) **entra direttamente nella percentuale mostrata al Team** (`match_score` esposto = `skills_score`, `paddock.functions.ts` ~1138) e anche nell'ordinamento via `final_score`; (8) il peso è letto dinamicamente da `matching_weights`, ma le **soglie 30/90/180 e i coefficienti 1/0.5/0.25 sono hardcoded in SQL**, non configurabili da Admin; (9) sì, `adminUpdateMatchingWeights` valida somma = 100 e lancia `recompute_matches(NULL, NULL)`, ricalcolando tutti i match; (10) nessun altro bonus/malus di freshness nello score (solo notifica e chip); (11) sì: a parità di tutto, fino a 4 punti separano due profili, quindi un profilo leggermente più compatibile può finire sotto uno con calendario più fresco; (12) non interagisce con nulla: è un addendo indipendente, sommato prima del cap a 100 (unico effetto indiretto: se lo score supera 100 il contributo viene tagliato).

Esempi con la formula reale:
- Freelance A: componenti professionali 92.0, calendario 12 giorni → coeff 100% → +4.00 → skills_score 96.00; nessun giorno mancante → final_score 96.00.
- Freelance B: componenti professionali 94.0, calendario 120 giorni → coeff 25% → +1.00 → skills_score 95.00 → **B più compatibile ma sotto A**.
- Freelance C: componenti professionali 90.0, calendario 400 giorni → +0 → skills_score 90.00; 2 giorni mancanti su richiesta single (penalità 10/giorno) → final_score 70.00.

Oggi la Calendar Freshness misura **esclusivamente la recenza dell'ultima scrittura sul calendario** (conferma esplicita o modifica di una data): nessun altro comportamento utente vi confluisce.

## 5. Calendario abbandonato

Nessuna scadenza. In tutti i casi le date restano AVAILABLE, il freelance resta nei match, può ricevere Pit Call e comparire ai Team. Varia solo il contributo: 29 gg → 4.00; 31 gg → 2.00; 89 gg → 2.00; 91 gg → 1.00; 179 gg → 1.00; 181 gg → 0; oltre → 0 (con chip `calendar_stale` e notifica ricorrente ogni 30 giorni). **Dichiarazione esplicita: oggi non esiste alcuna expiration dell'availability, nemmeno per date lontanissime nel tempo.**

## 6. Compatibilità della nuova filosofia

Compatibile e a basso rischio: il gate può vivere interamente nella CTE `ovl`/`valid` di `recompute_matches`, dove l'overlap è già calcolato con un `EXISTS` su `availability` — basta aggiungere una condizione temporale al predicato. Nessun dato viene cancellato, nessuno stato nuovo deve essere persistito, e il ritorno ad AVAILABLE è immediato perché qualsiasi conferma ri-triggera già `recompute_matches`. Punto di attenzione: essendo un filtro, un freelance "scaduto" sparisce dai match esistenti al primo recompute — serve comunicazione in-app prima della scadenza (l'infrastruttura `notifications`/`calendar_stale` è già pronta).

## 7. Availability vs Booked

Distinzione attuale: AVAILABLE è persistito, BOOKED è derivato dagli `engagements` a runtime e non esiste nel DB del calendario. Quindi una futura expiration colpirebbe **solo** le righe di `availability` — le date occupate non sono righe di availability e non possono scadere: l'engagement le protegge per costruzione. Edge case da considerare: (a) un giorno può essere sia in `availability` sia coperto da un engagement (il motore oggi non lo esclude — bug preesistente); (b) date passate mai ripulite; (c) `sim_now()` usato dalle notifiche ma **`now()` usato dal motore** → in ambiente TEST con offset temporale le due logiche divergono.

## 8. Granularità

- **A) Globale** — zero modifiche DB, già disponibile; granularità grossolana: una singola modifica ravvicinata "rinfresca" anche disponibilità dichiarate un anno prima. Rischio bug: nullo. UX: mediocre.
- **B) Per mese** — richiede nuova tabella/colonna di conferme mensili + UI dedicata; complessità media, dati aggiuntivi ~12 righe/anno/freelance; utile ma ridondante rispetto a D.
- **C) Per intervallo** — massima complessità (overlap, merge, split), nessun beneficio rispetto a D.
- **D) Per singolo giorno — già possibile a costo zero**: `availability.created_at` è di fatto un timestamp per data, perché le righe vengono solo inserite o cancellate. Non serve alcuna cronologia né storage aggiuntivo; serve solo usarlo nella query di matching (più un indice). Precisione massima, UX migliore, impatto DB nullo.

## 9. Modello ibrido

`effective_freshness(day) = GREATEST(freelancer_profiles.calendar_last_updated_at, availability.created_at)` è **implementabile subito senza modifiche di schema**. È anche la soluzione più semplice: la conferma globale copre tutto in un colpo, la modifica di un singolo giorno lo tiene fresco da sola. L'unica alternativa più semplice (solo timestamp globale) è meno precisa; qualsiasi struttura per mese/intervallo sarebbe overengineering.

## 10. Impatto DB e performance (soluzione consigliata: ibrida con `created_at`)

- Nuove colonne: nessuna obbligatoria (eventualmente `availability.confirmed_at` se si vuole confermare senza toccare `created_at`).
- Nuove tabelle: nessuna. Nuovi trigger: nessuno. Nuove RPC: nessuna (modifica di `recompute_matches`, eventualmente un `confirm_availability_range`).
- Indice consigliato: `(freelancer_id, day)` esiste già; utile un `(freelancer_id, created_at)` o composito con `day`.
- Record aggiuntivi: zero.
- Impatto query: il predicato `EXISTS` diventa `EXISTS ... AND (created_at > cutoff OR profilo confermato di recente)` — stessa complessità di scan.
- Volumi: 500 freelance ≈ 50–100k righe; 5.000 ≈ 0.5–1M; 50.000 ≈ 5–10M righe di availability. Il costo dominante resta il `recompute_matches` full (cross join richieste × freelance), non la freshness.
- Verdetto: **TRASCURABILE** su storage e schema, **MODERATO** solo sul recompute globale a 50k freelance (già oggi un punto critico).

## 11. Conseguenze sul peso 4%

- Da modificare: CTE `parts` (`fresh_s`), la somma in `computed`, il chip `calendar_stale` in `missing_criteria`, `adminUpdateMatchingWeights` (`src/lib/admin.functions.ts`, validazione somma 100), la UI `admin.matching.tsx`, e il colore hardcoded nelle pagine calendario/profilo.
- Sì: l'Admin **impone oggi** somma = 100 (errore altrimenti), quindi il 4% andrebbe redistribuito o la validazione allentata; la colonna `calendar_freshness_weight` può restare a 0 senza migration distruttiva. Nota: `role_weight` (valore 35 in tabella) è già legacy e non viene usato da `recompute_matches`, che usa `sub_role_weight`.
- Match esistenti: gli score cambierebbero solo dopo un recompute generale — che è già automatico al salvataggio dei pesi.
- Dipendenze nascoste: nessuna oltre a `missing_criteria.calendar_stale` (letto dalla UI dei match) e alla notifica `calendar_stale`.
- La separazione STEP 1 eligibility / STEP 2 professional matching è architetturalmente **più pulita** e naturale qui, perché il motore ha già una fase di hard filter (`hard`/`valid`) distinta dalla fase di scoring (`parts`): la freshness andrebbe semplicemente spostata dalla seconda alla prima. Vantaggi: percentuali mostrate ai Team che riflettono solo compatibilità reale, nessuna penalizzazione professionale. Rischi: calo improvviso del numero di match in fase di lancio, necessità di preavviso all'utente, e uno score medio che sale (attenzione al cap a 100).

## 12. Verdetto finale

1. Un record per giorno in `availability`, nessuna colonna di stato; BOOKED derivato dagli engagements a runtime.
2. Con l'unico timestamp globale `freelancer_profiles.calendar_last_updated_at`, scritto sia dalla conferma esplicita (`confirm_calendar`) sia dal trigger su ogni insert/delete di un giorno.
3. Tre fasce hardcoded in `recompute_matches` moltiplicate per il peso da `matching_weights`.
4. <30 gg = 100%, 30–89 = 50%, 90–179 = 25%, >=180 = 0%.
5. Fino a 4 punti su 100, sommati nella percentuale mostrata al Team e nell'ordinamento.
6. Restano validi per sempre: solo −4 punti, chip "calendar stale" e una notifica ogni 30 giorni.
7. No, nessuna expiration.
8. Riutilizzabili: `availability.created_at` (timestamp per giorno già esistente), `confirm_calendar`, i trigger di recompute, `emit_calendar_stale_notifications` + kind `calendar_stale`, `platform_settings` per rendere configurabili le soglie.
9. Ibrida: `GREATEST(conferma globale, created_at del giorno)` — precisione per data a costo zero.
10. Poco invasiva: nessuna nuova tabella, nessun nuovo trigger; il grosso è una condizione in `recompute_matches` più UI di conferma/avviso.
11. Rischi: calo brusco di match alla prima attivazione; divergenza `now()` vs `sim_now()` in ambiente TEST; date passate mai ripulite; il bug preesistente per cui i giorni già ingaggiati restano matchabili.
12. Sì, consigliata la separazione: la freshness è affidabilità del dato, non qualità professionale.
13. Sì, la filosofia è condivisibile e coerente con l'architettura esistente.
14. Architettura minima consigliata (da approvare prima di implementare): soglia di scadenza configurabile in `platform_settings` (es. `availability_max_age_days`), predicato di eligibility in `recompute_matches` basato su `GREATEST(calendar_last_updated_at, availability.created_at) > now() - soglia`, azione "conferma" già esistente estesa opzionalmente a un intervallo, avvisi progressivi tramite le notifiche `calendar_stale` esistenti, e rimozione di `fresh_s` dallo score con redistribuzione del 4%.
