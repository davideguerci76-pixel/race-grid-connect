# COME APRIRE UN BACKUP PITCALL

1. Copia `pitcall-backup-opener.html` sul PC (o su una chiavetta USB).
2. Aprilo con Chrome o Edge (doppio click; funziona anche da `file://`).
3. Seleziona il file `.pitbackup`.
4. Inserisci la password del backup.
5. Clicca **OPEN BACKUP**.
6. Se appare **BACKUP VALID**, clicca **DOWNLOAD DECRYPTED ZIP**.

Note:

- Funziona completamente offline: nessun dato e nessuna password lasciano il browser.
- PITCALL non può recuperare la password: se è persa, il backup non è recuperabile.
- Il ZIP decriptato contiene dati sensibili di business e utenti PITCALL: conservalo in modo sicuro o cancellalo dopo l'uso.
- Formato supportato: envelope `PITBKP01` (scrypt N=32768/r=8/p=1 + AES-256-GCM), manifest `PITCALL_BACKUP` v1.
- Questo file NON fa parte del sito PITCALL e non viene pubblicato: è uno strumento di emergenza da conservare separatamente dal backup e dalla password.
