# HOME-PREOPEN-01A/B — Micro-remediation claim e wrapping

## Obiettivo
Correggere esclusivamente i quattro claim hero non inglesi e rendere intenzionale il wrapping dei due titoli pre-opening, senza alterare copy approvato, asset, flag o logica.

## Implementazione
- Sostituire soltanto `home.hero_1`, `home.hero_2` e `home.hero_3` in IT/ES/FR/DE con le stringhe definitive; EN resta invariato.
- Conservare la seconda parte del claim hero come elemento rosso nelle cinque lingue.
- Separare contenuto localizzato e composizione visuale dei due titoli pre-opening usando gruppi semantici non spezzabili e break responsive controllati.
- Conservare esattamente il termine finale rosso equivalente a `NOW!`, inclusa la punteggiatura.
- Non modificare traduzioni pre-opening, paragrafi, immagine, trackside claim, toggle, flag o business logic.

## Verifica
- Testare HERO e i due titoli pre-opening in EN/IT/ES/FR/DE a 1440, 1280, 1024, 768, 480, 390 e 360 px, includendo larghezze intermedie.
- Verificare cambio lingua senza refresh e persistenza dopo refresh.
- Controllare assenza di overflow, clipping, parole spezzate, collisioni e composizioni sbilanciate.
- Verificare build/runtime e confermare che i dati LIVE e il gate Pit Call creation restano invariati.
