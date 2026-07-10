## Fix account type + multi-request system for Teams

### 1. Bug: login mostra sempre "FREELANCER"
Il trigger `handle_new_user` legge `raw_user_meta_data->>'user_type'`, ma il form di signup probabilmente non passa quel metadato (o usa una chiave diversa) → il default `'freelancer'` vince sempre anche quando l'utente sceglie "Team".

**Fix:**
- Verificare `src/routes/auth.tsx` (o equivalente): passare `options.data.user_type` in `supabase.auth.signUp` in base alla scelta dell'utente.
- Aggiungere un fallback lato UI in `dashboard.profile.tsx`: se il profilo esiste già come freelancer ma l'utente vuole essere team, permettere lo switch (già fatto in parte) e assicurarsi che al primo login post-OAuth Google venga chiesto il tipo account (Google non passa `user_type`).
- Per gli account Google: aggiungere un onboarding step "Sei freelancer o team?" alla prima visita in dashboard se `profiles.user_type` è default e nessun sub-profile è stato compilato.

### 2. Sistema di richieste multiple per Team (5 token/richiesta)

Attualmente `dashboard.calendar.tsx` mostra un `TeamRequestForm` singolo. Va trasformato in un vero gestionale di richieste.

**Nuova pagina `/dashboard/requests`** (per soli team):
- Lista di tutte le richieste create (attive, in pausa, chiuse, completate) con: ruolo cercato, disciplina, date, n° match, stato, azioni.
- Bottone "New request" → apre form (riuso `TeamRequestForm`).
- Al submit: verifica saldo token ≥ 5, addebita 5 token via nuova RPC `create_request(...)` SECURITY DEFINER che fa `credit_tokens(-5, 'request_post')` in transazione con l'INSERT su `requests`.
- Se saldo < 5: modale "Ricarica token".
- Azioni per richiesta: **Pause/Resume** (toggle `is_active`), **Close** (`status='closed'`), **Mark completed** (chiude e mostra CTA "Crea nuova richiesta simile" che duplica il form pre-compilato).
- Ogni richiesta ha la sua vista dettaglio con la lista match candidati (riuso logica reveal esistente).

**Backend:**
- Aggiungere `token_reason` enum value `'request_post'` (migration).
- Aggiungere colonna `status` a `requests` (`active|paused|closed|completed`) se non esiste, con default `active`.
- Nuova RPC `create_request(payload jsonb)` che valida saldo, inserisce, addebita 5 token, ritorna la request creata. Grant EXECUTE ad `authenticated`.
- Nuova RPC `close_request(_id uuid)` / `set_request_status(_id, _status)` con check owner.
- Notifica "richiesta creata" e trigger già esistente `tg_recompute_on_request` continua a funzionare.

**Sidebar/navigation:**
- Aggiungere link "My Requests" nella dashboard sidebar visibile solo se `user_type='team'`.
- Rimuovere/nascondere "Manage Calendar" per i team (il calendario è concettualmente dei freelancer).

**Costo indicativo:** ~35–45 crediti.

### File toccati
- `src/routes/auth.tsx` (signup meta)
- `src/routes/_authenticated/dashboard.profile.tsx` (onboarding tipo account post-Google)
- `src/routes/_authenticated/dashboard.requests.tsx` (nuova pagina lista)
- `src/routes/_authenticated/dashboard.requests.$id.tsx` (dettaglio richiesta + match)
- `src/components/team-request-form.tsx` (submit via RPC, costo 5 token, redirect a lista)
- `src/components/dashboard-sidebar.tsx` (link condizionale)
- Migration Supabase: enum value, colonna `status`, RPC `create_request` / `set_request_status`.

Confermi?
