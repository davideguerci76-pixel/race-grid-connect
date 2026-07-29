# Anti-Ghosting Team → Freelance

## Timing (configurabile in Admin → Tokens/Settings, tutti in giorni `sim_now()`)
- `ghosting_freelance_check_days` = **3** — dopo tanti giorni dalla conferma match, chiedo al freelance "il team ti ha contattato?"
- `ghosting_team_reminder1_days` = **5** — se il freelance ha risposto NO, primo sollecito collaborativo al team
- `ghosting_team_reminder2_days` = **8** — secondo sollecito al team ("il match verrà liberato se non confermato")
- `ghosting_deadline_days` = **10** — se ancora nulla, rilascio automatico + rating unilaterale abilitato per il freelance

Se il freelance risponde YES o il team clicca "Confermo il contatto" in qualsiasi momento → sequenza chiusa, nessun altro sollecito.

## 1. Schema (`engagements` + nuove enum notif)
Colonne aggiunte a `engagements`:
- `freelancer_contacted` boolean, `freelancer_contacted_at` timestamptz
- `team_confirmed_contact` boolean, `team_confirmed_contact_at` timestamptz
- `contact_check_sent_at`, `team_reminder1_sent_at`, `team_reminder2_sent_at`, `ghosting_released_at` timestamptz
- `cancellation_kind` accetta il nuovo valore `team_ghosting`

Nuovi `notif_kind`:
- `contact_check` (→ freelance, con SI/NO)
- `team_contact_reminder_1`, `team_contact_reminder_2` (→ team, con CTA "Ho contattato il freelance")
- `ghosting_released` (→ freelance, con CTA "Lascia una recensione al team")
- `team_ghosted` (→ team, notifica di rilascio e blocco reputazionale)

## 2. Funzioni DB (SECURITY DEFINER, usano `sim_now()`)
- `freelancer_answer_contact(_engagement_id, _contacted boolean)` — freelance risponde SI/NO. Se SI → chiude la sequenza. Se NO → nessun cambio di stato, semplicemente registrato.
- `team_confirm_contact(_engagement_id)` — team dichiara di aver contattato → sequenza chiusa (`team_confirmed_contact=true`).
- `emit_contact_checks()` — inserisce `contact_check` per engagements `confirmed` con `confirmed_at ≤ sim_now() - N gg` e nessun contact_check già inviato.
- `emit_team_ghosting_reminders()` — invia reminder 1 / reminder 2 secondo soglie, solo se `freelancer_contacted = false` e `team_confirmed_contact` è NULL.
- `release_ghosted_engagements()` — alla deadline, se ancora ghosting: `status='cancelled'`, `cancellation_kind='team_ghosting'`, `cancelled_by=team_id`, `ghosting_released_at=now()`, notifica `ghosting_released` al freelance + `team_ghosted` al team. Le date tornano verdi perché il calendario blocca solo status `confirmed` o cancellazioni "late" (regola già esistente): `team_ghosting` non è nella lista bloccante.
- `submit_rating_v2` esteso: consente rating anche se `status='cancelled' AND cancellation_kind='team_ghosting'`, purché sia il freelance a scrivere e verso il team. La regola double-blind non si applica al rating unilaterale (esce subito visibile, `unlocked_at=now()`).

Grants coerenti con lo standard esistente: revoke da `anon`/`PUBLIC`, execute a `authenticated` per le due RPC "azione utente"; nessun grant pubblico per le funzioni cron `emit_*` / `release_*` (le chiama solo l'admin via Time Machine o pg_cron).

## 3. UI Freelance — `dashboard.engagements.tsx`
- Card di ogni engagement `confirmed`: nuovo pulsante permanente **"The team contacted me"** (verde, in cima).
- Inbox notifications: quando arriva `contact_check`, la card mostra domanda + due bottoni **Yes** / **No, not yet**.
- Card di engagement `cancelled` con `cancellation_kind='team_ghosting'`: banner rosso "The team ghosted you" + CTA **"Leave a unilateral rating"** → apre il modal rating esistente pre-compilato verso il team.

## 4. UI Team — `dashboard.engagements.tsx`
- Card di engagement `confirmed` non ancora confermato: pulsante **"I contacted the freelancer"**.
- Notifiche `team_contact_reminder_1` / `_2` renderizzate con testo dedicato e stessa CTA.
- Notifica `team_ghosted` renderizzata come warning "Match released — leave open the calendar so it doesn't happen again".

## 5. Admin Time Machine (`admin.tsx`)
Tre nuovi bottoni oltre a quelli esistenti:
- Emit contact checks now
- Emit team ghosting reminders now
- Release ghosted engagements now

Ognuno chiama la rispettiva RPC via nuova serverFn in `paddock.functions.ts` (`adminEmitContactChecks`, `adminEmitTeamReminders`, `adminReleaseGhosted`) protette da `requireSupabaseAuth` + check `has_role('admin')`.

## 6. Platform Wiki (`admin.wiki.tsx`)
Nuova sezione **Anti-Ghosting** che riassume timeline (3 → 5 → 8 → 10 giorni), attori, esito e impatto reputazionale.

## Note tecniche
- Uso `sim_now()` ovunque per compatibilità Time Machine.
- Il calendario del freelance già rappresenta "engaged" solo se `status='confirmed'` o cancellazioni penalty; `team_ghosting` non blocca ⇒ ritorno automatico a verde senza ulteriore lavoro sull'UI calendario.
- I costi/timing sono in `platform_settings` per essere modificati live dall'admin senza migration.
