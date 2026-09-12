# Guided Demo Team — correzione spiegazione finale

## Root cause confermata
Il percorso usa due stati distinti: `results` e `end`. Il blocco `trial.results.next` era renderizzato esclusivamente nello stato intermedio `results`; premendo “Finish” il componente passa a `end`, smonta l’intera schermata risultati e mostra “Questo è PITCALL” senza quel blocco.

Il precedente controllo Playwright ha verificato `What happens next` **prima** di premere “Finish” (`check.py`, righe 136–138). Dopo il passaggio alla schermata finale controllava soltanto il titolo “That's PITCALL” (`check.py`, righe 140–145), senza verificare Request Confirmation, conferma del Freelancer o reveal dei contatti. Ha quindi validato lo stato intermedio sbagliato e prodotto un falso PASS.

## Modifica
- Spostare la spiegazione esistente da `results` alla schermata conclusiva `end`, tra il riepilogo e il testo di chiusura.
- Riutilizzare le traduzioni EN/IT/ES/FR/DE già presenti, senza cambiare “Data Analysis”, taxonomy, matching, lifecycle o backend.
- Mantenere invariati il termine della demo, i pulsanti “Torna alla dashboard” e “Ricomincia”, e l’unica marcatura di completamento già esistente.

## Retest corretto
- Percorrere la demo completa su viewport mobile fino a “Questo è PITCALL”.
- Solo dopo “Finish”, verificare nella stessa schermata: Request Confirmation, conferma del Freelancer, reveal dei contatti, ritorno alla dashboard e riavvio.
- Verificare Data Analysis, Preview 6 → 4 e i quattro risultati/percentuali/Full-Partial invariati.
- Registrare le richieste durante il percorso per confermare l’assenza di nuove business mutation.
- Salvare uno screenshot effettivo della schermata finale e aggiornare il report con root cause, evidenze, controlli e stato `READY FOR HUAT`.

## Verifica tecnica
- Controllare typecheck e build automatica.
- Nessuna modifica a database, Demo Mode interno, taxonomy, token, notifiche, Engagement o contatti reali.
