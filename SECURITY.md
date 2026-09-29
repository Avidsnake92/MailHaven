# Sicurezza

## Segnalare una vulnerabilità

Se trovi un problema di sicurezza in MailHaven, **non aprire una issue pubblica**: descrivilo in privato in uno di questi due modi.

- Da GitHub: scheda **Security → Report a vulnerability** di questo repository (segnalazione privata).
- Dal [modulo contatti](https://mailhaven.it/contatti/), scegliendo "Altro" e scrivendo nel messaggio che si tratta di una segnalazione di sicurezza.

Indica la versione di MailHaven (la vedi in *Impostazioni → Aggiornamento* e nel file `version.json`), i passaggi per riprodurre il problema e l'effetto che ha. Rispondiamo entro un giorno lavorativo e ti teniamo aggiornato fino alla correzione.

## Versioni supportate

Le correzioni di sicurezza escono nell'ultima versione rilasciata. Aggiorna dall'interfaccia, in *Impostazioni → Aggiornamento*: [CHANGELOG](CHANGELOG.md).

## Cosa proteggere in un'installazione

- **`ENCRYPTION_KEY`**: cifra le email e le password delle caselle. Conservala in un password manager; senza di lei l'archivio non si legge, e chi la ottiene può leggerlo.
- **`.env`**: contiene i segreti dell'installazione (`JWT_SECRET`, password del database). Non va condiviso né incluso in copie non protette.
- Esporre MailHaven su internet solo dietro un reverse proxy con HTTPS.
