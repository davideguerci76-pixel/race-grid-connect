# Deep Security Scan — PITCALL

## Obiettivo
Eseguire uno scan di sicurezza approfondito del backend Supabase e dell'app PITCALL, analizzare i risultati e produrre un report con priorità e raccomandazioni. Nessuna modifica al codice in questa fase.

## Fasi

1. **Esecuzione scan completo** (~5–10 min)
   - Avviare `security--run_security_scan` con scope completo.
   - Coprire: RLS, grants, funzioni SECURITY DEFINER, esposizione dati sensibili, auth/ruoli, configurazioni admin.

2. **Raccolta schema e contesto** (~3–5 min)
   - Caricare eventuali finding persistiti con `security--get_scan_results`.
   - Verificare lo schema attuale e le policy già note (coordinate profili, VAT, ruoli admin).

3. **Analisi e classificazione** (~10–15 min)
   - Raggruppare i finding per severità (critical / warning / info).
   - Verificare quali sono nuovi rispetto alle modifiche recenti (coordinate/VAT/admin grants).
   - Identificare falsi positivi o finding già mitigati.

4. **Report e raccomandazioni** (~5–10 min)
   - Sintetizzare i risultati in linguaggio chiaro.
   - Evidenziare eventuali criticità da affrontare prima del go-live.
   - Proporre ordine di intervento senza modificare nulla.

## Cosa NON verrà fatto in questa fase
- Nessuna modifica a RLS, grants, codice o database.
- Nessun fix automatico; eventuali interventi saranno proposti separatamente per approvazione.

## Tempo stimato totale
**15–30 minuti** per scan + analisi + report iniziale.