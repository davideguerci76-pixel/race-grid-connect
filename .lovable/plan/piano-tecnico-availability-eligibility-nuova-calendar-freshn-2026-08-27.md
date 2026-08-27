# Piano tecnico — Availability Eligibility & nuova Calendar Freshness

Obiettivo: la freshness diventa un requisito di **validità della disponibilità**, non un componente dello score professionale. Nessuna cancellazione di dati, nessuna penalità.

## 1. Migration DB

Una sola migration, non distruttiva:

- `ALTER TABLE freelancer_profiles ADD COLUMN calendar_last_confirmed_at timestamptz` (nullable).
- Nuove righe in `platform_settings` (categoria `calendar`):
  - `availability_fresh_days` = 45
  - `availability_review_days` = 60
  - `availability_max_age_days` = 90
- Indice `availability (freelancer_id, created_at)`.
- Backfill di transizione (vedi §17).
- Riscrittura di `recompute_matches`, `confirm_calendar`, `emit_calendar_stale_notifications`.

## 2. Cosa succede a `calendar_last_updated_at`

Resta **invariata** come semantica (“ultima attività sul calendario”) e resta aggiornata dal trigger `tg_bump_calendar_freshness` su INSERT/DELETE. Continua a servire: admin panel (`admin.functions.ts`, `admin-user-actions.tsx`), profilo pubblico freelance, Testing Lab. Nessuna dipendenza viene rotta. Semplicemente **non viene più usata dal motore di matching**.

## 3. `calendar_last_confirmed_at`

Nuova colonna, scritta **solo** dalla RPC `confirm_calendar` (azione esplicita dell'utente). Mai dal trigger. È il timestamp che “rinfresca in blocco” tutte le availability esistenti.

## 4. Formula di effective freshness

```text
effective_freshness(day_row) = GREATEST(
   COALESCE(fp.calendar_last_confirmed_at, '-infinity'),
   day_row.created_at
)
age_days = now_ref() - effective_freshness
```
Nessuna scrittura per riga: `created_at` esiste già ed è di fatto “quando quel giorno è stato dichiarato”.

## 5. Pulsante "Confirm Calendar"

`confirm_calendar()` aggiornata: imposta `calendar_last_confirmed_at = now_ref()` (oltre a `calendar_last_updated_at` e `updated_at` come oggi) e lancia `recompute_matches`. Effetto: tutte le availability presenti tornano FRESH istantaneamente, zero righe scritte in `availability`. La semplice apertura della pagina non conferma nulla.

## 6-8. Soglie proposte (da approvare)

| Stato | Età dell'effective freshness | Comportamento |
|---|---|---|
| **FRESH** | 0–44 giorni | usata normalmente nel matching |
| **NEEDS REVIEW** | 45–89 giorni | ancora usata nel matching; avviso gentile in UI + notifica a 45 e a 75 giorni |
| **UNCONFIRMED** | ≥ 90 giorni | resta visibile nel calendario, non usata nel matching |

Razionale: 45 giorni copre il ritmo tipico di un campionato (conferma ~una volta al mese e mezzo); 90 giorni è già la soglia “gialla/rossa” percepita oggi in UI, quindi non sposta le abitudini. Tutti i valori vivono in `platform_settings`, letti via `get_setting_num()` — nessuna soglia hardcoded, né in SQL né nel client (la UI le riceve da una serverFn).

## 9. Modifica a `recompute_matches`

Nella CTE che calcola l'overlap, il predicato `EXISTS (... FROM availability a WHERE a.freelancer_id = ... AND a.day = d)` diventa:

```sql
EXISTS (
  SELECT 1 FROM availability a
  WHERE a.freelancer_id = f.user_id
    AND a.day = d
    AND a.day >= now_ref()::date                                  -- §16 date passate
    AND GREATEST(COALESCE(fp.calendar_last_confirmed_at,'-infinity'), a.created_at)
        > now_ref() - (max_age_days || ' days')::interval          -- §2 eligibility
    AND NOT EXISTS (                                               -- §11 double booking
      SELECT 1 FROM engagements e
      WHERE e.freelancer_id = f.user_id
        AND e.status IN ('confirmed','completed')
        AND blocked_day(e, d)
    )
)
```
`blocked_day(e, d)`: `d = ANY(r.season_dates)` quando la request collegata ha `season_dates` non nullo, altrimenti `d BETWEEN e.start_date AND e.end_date` — stessa identica regola già usata da `getMyBlockedDates`, estratta in una funzione SQL immutabile-per-riga così che UI e motore condividano una sola definizione.

## 10. Rimozione della freshness dallo score

- `fresh_s` eliminato dalla CTE `parts` e dalla somma in `computed`; `skills_score` e `final_score` non lo contengono più.
- La colonna `matching_weights.calendar_freshness_weight` **resta** (nessuna migration distruttiva) ma è ignorata dal motore. Nell'admin UI viene marcata come non più attiva e **esclusa dalla validazione somma = 100** in `adminUpdateMatchingWeights` — unica modifica ai pesi, necessaria per non bloccare il salvataggio. La redistribuzione la fai tu a mano.
- `missing_criteria`: il chip `calendar_stale` non è più un criterio mancante di *qualità*. Viene rimosso dallo score-side; le date non eleggibili semplicemente non contribuiscono all'overlap, quindi si riflettono già nel conteggio dei giorni mancanti (partial match). Lato Team nessun chip nuovo: non vogliamo esporre lo stato del calendario altrui.

## 11-12. Bug engagement / double booking e partial match

Una sola fonte di verità: `availability effettiva = availability dichiarata − giorni bloccati da engagement confirmed/completed`. Non si cancella nessuna riga di `availability` (una cancellazione di engagement deve poter restituire il giorno; e il trigger di bump falserebbe la freshness).

Conseguenze verificate:
- **Multi-day / season_dates**: gestiti da `blocked_day()` con la stessa logica della UI.
- **Partial match**: il meccanismo non cambia — i giorni bloccati semplicemente non contano nell'overlap, quindi finiscono nei `missing_days` e nelle soglie `partial_*_max_missing_pct` esistenti. Nessun percorso separato, nessuna rottura.
- **Cancellazione/chiusura engagement**: lo status esce da confirmed/completed, i giorni tornano automaticamente disponibili. Serve un trigger `AFTER UPDATE OF status ON engagements` che chiami `recompute_matches(freelancer_id, NULL)`; da verificare se ne esiste già uno equivalente e in tal caso riusarlo.
- Sovrapposizioni parziali: risolte per singolo giorno, non per intervallo — nessun caso ambiguo.

## 13. Clock LIVE/TEST

Il motore passa da `now()` a `sim_now()`, esattamente come già fanno le notifiche. `sim_now()` è security definer e legge `admin_time_settings` applicando l'offset **solo in ambiente TEST**: in LIVE restituisce `now()` e nessun utente può influenzarlo. Tutte le logiche (freshness, expiration, warning, notifiche, recompute, filtro date passate) useranno lo stesso riferimento, indicato sopra come `now_ref()`.

## 14. Notifiche

`emit_calendar_stale_notifications()` riscritta: non guarda più il solo timestamp globale ma la presenza di availability **future** entrate in NEEDS REVIEW o UNCONFIRMED. Due momenti, deduplicati come oggi:
- ingresso in NEEDS REVIEW (45 gg) e promemoria a 75 gg → tono gentile;
- ingresso in UNCONFIRMED (90 gg) → messaggio informativo, non punitivo.

Riusa il kind `calendar_stale` esistente (nessun nuovo valore enum) con payload arricchito (`state`, `affected_days`) così che UI ed email possano differenziare il copy. `notification-email.ts`: label aggiornata a “Review your availability”.

## 15. UI

Pagina `dashboard/calendar`:
- il box freshness mostra lo stato calcolato lato server (FRESH / NEEDS REVIEW / UNCONFIRMED) con le soglie provenienti da `platform_settings` — via `getMyCalendarFreshness` esteso; spariscono i 30/90 hardcoded nel client.
- nuova quarta voce di legenda e colore dedicato per i giorni UNCONFIRMED nel `AvailabilityCalendar` (visibili ma visivamente “in pausa”).
- CTA invariata come flusso: “Review your availability” → “Everything is still correct — Confirm”.
- Copy proattivo, mai punitivo, in tutte e 5 le lingue: “Some of your available dates haven't been reviewed recently.”, “We've temporarily stopped using these dates for matching because we can't be sure they're still current. Review them anytime to make them active again.”
- Profilo pubblico freelance (`freelancers.$id.tsx`): stesse soglie centralizzate al posto di quelle hardcoded.

## 16. Date passate

Nessuna cancellazione. Filtro `a.day >= now_ref()::date` nel motore, nelle notifiche e nei conteggi UI: le date passate diventano semplicemente irrilevanti ovunque. Restano nel DB come storico e non generano warning. Un'eventuale pulizia periodica resta opzionale e fuori scope.

## 17. Transizione dei calendari esistenti

Nella stessa migration, backfill:

```sql
UPDATE freelancer_profiles
SET calendar_last_confirmed_at = GREATEST(calendar_last_updated_at, now() - interval '30 days')
```
Effetto: al deploy **nessun** utente è UNCONFIRMED e chi era già inattivo entra in NEEDS REVIEW solo dopo 15 giorni, con almeno 60 giorni di margine prima di diventare UNCONFIRMED. Il pool disponibile non crolla, lo storico reale (`calendar_last_updated_at`) non viene toccato, e ogni utente riceve le notifiche di review prima di qualsiasi effetto sul matching.

## 18. Edge case ancora aperti

- Freelance senza alcuna availability futura: nessuna notifica, nessuno stato — da confermare che è il comportamento voluto.
- Engagement `proposed` (non ancora confermato): oggi non blocca, e nel piano continua a non bloccare. Confermi?
- Un giorno reso UNCONFIRMED mentre un match esiste già: al primo recompute il match perde quei giorni e può passare da full a partial o sparire. Mitigato dal backfill e dalle notifiche, ma resta un effetto visibile per i Team.
- `admin.matching.tsx`: il campo Calendar Freshness resta visibile ma inattivo finché non redistribuisci i pesi.
- Il Testing Lab imposta oggi `calendar_last_updated_at` alla generazione: dovrà impostare anche `calendar_last_confirmed_at`.
