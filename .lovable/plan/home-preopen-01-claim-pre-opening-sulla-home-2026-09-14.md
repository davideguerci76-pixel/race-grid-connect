# HOME-PREOPEN-01 — Claim pre-opening sulla Home

## Obiettivo
Mantenere invariata la Home pubblica approvata, correggere solo le traduzioni della hero e inserire una nuova sezione pre-opening controllata dall’ACP.

## Implementazione
- Aggiungere al sistema Launch esistente il flag globale indipendente `flag_home_preopening_claim`, inizialmente **ON**.
- Esporre nell’ACP Launch il toggle **CLAIM PRE-OPENING**, usando gli stessi controlli Admin server-side, validazione booleana, audit e aggiornamento già adottati dagli altri toggle.
- Estendere la lettura pubblica dei flag senza collegare il nuovo controllo a Coming Soon, statistiche, acquisti token o creazione Pit Call.
- Inserire la sezione subito dopo la hero e prima di “How PITCALL works”; con flag OFF non verrà renderizzato alcun contenitore o spazio residuo.
- Generare un’immagine panoramica ottimizzata e dedicata: pit lane realistica al tramonto, atmosfera dark racing, bridge con il solo claim incorporato `JOIN THE GRID. POWER THE PADDOCK.`. L’immagine allegata resta riferimento e non verrà inserita direttamente né usata per cambiare la hero.
- Comporre la nuova sezione full-width con testo a sinistra, immagine dominante a destra/background, contrasto e accenti PITCALL esistenti; nessuna animazione, overlay di apertura o redesign delle altre sezioni.

## i18n
- Correggere `home.hero_1`, `home.hero_2`, `home.hero_3` e `home.sub` in EN/IT/ES/FR/DE, lasciando markup, font, dimensioni, colori e layout della hero invariati.
- Aggiungere chiavi dedicate per tutto il copy pre-opening in EN/IT/ES/FR/DE, con traduzioni naturali e terminologia PITCALL coerente.
- Lasciare il trackside claim nell’immagine, sempre in inglese e fuori dal sistema i18n.
- Verificare anche persistenza lingua dopo refresh e traduzione delle CTA esistenti.

## Sicurezza e autorità
- Non modificare `pitcall_creation_allowed()` né `create_request()`.
- Conservare lo stato LIVE rilevato: Coming Soon OFF, Pit Call creation disabled ON, statistiche Home OFF, token purchases OFF.
- Il nuovo flag è globale come gli altri flag Launch: l’ACP TEST/LIVE non crea due valori separati. Questo non altera l’isolamento dei dati né il gate server-side, che continua a permettere TEST/DEMO e bloccare LIVE.
- Eseguire test negativi senza creare Pit Call LIVE e senza modificare utenti, token, engagement, disponibilità, matching, rating o notifiche.

## Verifica
- Toggle ON/OFF con controllo DOM e screenshot: ordine hero → claim → How; OFF: hero → How senza residui.
- EN/IT/ES/FR/DE per hero, nuova sezione e CTA; refresh diretto almeno EN/IT e una lingua aggiuntiva.
- Desktop, tablet e mobile: nessun overflow, clipping o sovrapposizione; crop leggibile e altezza proporzionata.
- Controlli regressione su header, selettore lingua, login, signup, CTA Freelancer/Team, How, CTA finale, footer e navigazione mobile.
- Verifica server-authoritative del blocco LIVE con flag OFF, senza inserimenti reali.
- Controllo build/runtime e report finale nelle 20 sezioni richieste, includendo configurazioni prima/dopo e conferma delle modifiche LIVE limitate alla sola nuova riga/configurazione del claim.

## Dettagli tecnici
- File interessati previsti: Home, flag pubblici, ACP Launch, cinque bundle Home, cinque bundle ACP e nuovo asset.
- Nessuna nuova dipendenza e nessuna modifica a matching, lifecycle, onboarding, taxonomy, pricing o Restore All.
