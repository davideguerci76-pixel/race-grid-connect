# Acquisto e connessione dominio pitcall.net

## Cosa faremo
Portare la piattaforma Pit Call sull'indirizzo personalizzato **pitcall.net** invece del sottodominio `.lovable.app` attuale.

## Chi acquista il dominio
Il dominio deve essere acquistato **dall'utente** direttamente dentro Lovable (funzione disponibile solo su piani a pagamento). L'agente non può effettuare l'acquisto al suo posto.

## Passaggi

### 1. Verifica piano e pubblicazione
- Assicurarsi che il progetto sia su un piano Lovable che supporti l'acquisto domini.
- Pubblicare il progetto se non è già pubblico (al momento è pubblico su `race-grid-connect.lovable.app`).

### 2. Acquisto dominio da parte dell'utente
- Andare in **Project Settings → Project section → Domains**.
- Cliccare **Buy new domain**.
- Cercare **pitcall.net** e selezionarlo.
- Completare i dati di contatto e pagamento.

### 3. Connessione automatica
- I domini acquistati tramite Lovable vengono collegati automaticamente al progetto.
- Non serve aggiungere manualmente record DNS A/TXT.

### 4. Configurazione domini consigliata
- Aggiungere sia `pitcall.net` (root) che `www.pitcall.net`.
- Impostare uno dei due come **Primary**; l'altro reindirizzerà al primario.

### 5. Verifica e test
- Aspettare il provisioning SSL (solitamente automatico, massimo qualche minuto).
- Verificare che `https://pitcall.net` risponda correttamente.
- Controllare che i link interni e i redirect funzionino.

## Cosa farà l'agente
- Dopo l'acquisto, monitorare lo stato del dominio e confermare quando è attivo.
- Se necessario, aggiornare eventuali riferimenti assoluti nel codice o nelle meta tag.
- Verificare il funzionamento tramite il tool di stato dominio.

## Nota
L'acquisto è un'azione che richiede i dati di pagamento dell'utente e non può essere delegata all'agente. Una volta acquistato, l'integrazione tecnica è gestita automaticamente da Lovable.
