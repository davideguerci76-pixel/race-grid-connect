# PRIVACY-UX-01 — Identity privacy reassurance

## Obiettivo
Aggiungere una rassicurazione privacy breve e coerente nei punti in cui Freelancer e Team inseriscono o consultano dati identificativi e di contatto, senza cambiare alcuna regola o accesso ai dati.

## Modifiche previste
- Creare un piccolo componente condiviso con icona lucchetto, titolo e testo secondario, usando colori e bordi già presenti in PITCALL.
- Nel signup mostrare il box una sola volta, subito dopo i campi identificativi:
  - Freelancer: dopo First Name + Last Name, con testo riferito ai Team.
  - Team: dopo Team Name, con testo riferito ai Freelancer.
- Nel Profile/Onboarding mostrare il box una sola volta nella sezione “Personal Info”, sopra email/nome/telefono:
  - variante Freelancer riferita ai Team;
  - variante Team riferita ai Freelancer.
- Sostituire il richiamo privacy separato oggi vicino al telefono Freelancer, evitando duplicazioni; la spiegazione funzionale del perché serve il telefono resta invariata.
- Aggiungere testi naturali EN/IT/ES/FR/DE, senza fallback o stringhe hardcoded.

## Test
- Verificare signup Freelancer: box presente, First Name/Last Name e Confirm Password invariati, nessuna creazione account.
- Verificare signup Team: box presente, Team Name invariato, nessun campo First Name/Last Name.
- Verificare Profile Freelancer e Team con sessioni TEST esistenti, senza scritture LIVE.
- Verificare EN/IT/ES/FR/DE e layout desktop/mobile con screenshot reali.
- Rieseguire l’audit sulle query e authority esistenti per confermare:
  - dati identificativi e contatti non disponibili alla controparte prima del reveal;
  - Contact Reveal post-conferma invariato;
  - nessuna nuova query, modifica backend, RLS, matching o lifecycle.
- Confrontare il fingerprint business LIVE prima/dopo e produrre il report sintetico richiesto.

## File attesi
- Un componente UI condiviso per la rassicurazione.
- Signup e Profile/Onboarding.
- Cinque bundle di traduzione dedicati.
- Report finale in `uat-ops`.

## Vincoli
- Nessuna migrazione o modifica dati.
- Nessun nuovo consenso, checkbox, popup o passaggio.
- Nessun account LIVE creato.
- Se emergesse la necessità di cambiare authority privacy o Contact Reveal, fermarsi senza applicare quella modifica.
