# MailHaven

**Archiviazione email self-hosted per MSP, rivenditori IT e aziende.**
*Self-hosted email archiving for MSPs and businesses: IMAP, Microsoft 365, Gmail and PEC, encrypted, with antivirus, antispam and Legal Hold. Italian interface and documentation.*

Sito: <https://mailhaven.it> · [Documentazione](https://mailhaven.it/documentazione/) · [Prezzi](https://mailhaven.it/prezzi/) · [Contatti](https://mailhaven.it/contatti/)

MailHaven copia le email dalle caselle dei tuoi clienti, le comprime, le cifra con AES-256-GCM e le rende ricercabili da un'unica console web. Gira sul tuo server con Docker Compose: le email non passano dai server di chi lo sviluppa.

## Cosa fa

- **Più aziende in un'unica installazione**, con dati separati: un rivenditore vede solo i propri clienti, l'admin di un'azienda solo le sue caselle, un utente solo quelle che gli sono assegnate.
- **Sorgenti**: IMAP (qualsiasi provider, PEC comprese), Microsoft 365 tramite Microsoft Graph, Gmail e Google Workspace tramite API Google (OAuth). POP3 con l'add-in per Outlook, che carica lo storico e archivia la posta inviata; estensione per Thunderbird.
- **Archivio**: tutte le cartelle e sottocartelle, ogni email salvata una volta sola (riconoscimento per Message-ID), ricevute PEC riconosciute ed etichettate. Ricerca, esportazione in EML, ripristino nella casella.
- **Sicurezza degli allegati**: antivirus ClamAV con regole YARA (verifica VirusTotal facoltativa) e doppio antispam, con il punteggio del server di origine più quello di Rspamd.
- **Legal Hold e conservazione**: le email bloccate non si possono eliminare in nessun modo; per ciascuna restano registrati chi, quando e perché. Conservazione impostabile per casella e registro di audit.
- **Accesso protetto**: verifica in due passaggi (TOTP), blocco dell'account dopo 10 tentativi sbagliati, recupero della password con link monouso.
- **Backup cifrati** `.mhbak` su S3 (anche compatibili) o SFTP, e [uno script per aprirli senza MailHaven](#aprire-un-backup-senza-mailhaven).
- **Import** di archivi PST, EML, MBOX e ZIP; white-label per i rivenditori.

## Limiti da conoscere

- La sincronizzazione delle caselle è **periodica, non in tempo reale**: un'email ricevuta e cancellata prima della sincronizzazione successiva non viene archiviata. Per POP3 la posta inviata viene archiviata dall'add-in per Outlook appena spedita.
- **Non è un servizio di conservazione sostitutiva a norma di legge**: non applica firma digitale né marca temporale.
- La chiave di cifratura la custodisce chi installa: **se la perdi, l'archivio non si può più leggere**, da nessuno.

## Edizioni

| | Community | Pro | Pro a vita | Rivenditori |
|---|---|---|---|---|
| Prezzo (IVA esclusa) | gratis | 1,50 € a casella al mese | 790 € una tantum | listino a scaglioni |
| Aziende | 1 | 1 | 1 | più aziende |
| Caselle | fino a 25 | a consumo | fino a 50 | a scaglioni |
| Archivio cifrato, IMAP, Microsoft 365, Gmail, audit | sì | sì | sì | sì |
| Antivirus, antispam, Legal Hold, backup, import, ricerca su tutte le caselle | no | sì | sì | sì |
| White-label | no | no | no | sì |

Le funzioni Pro si attivano inserendo una chiave di licenza nelle impostazioni, senza reinstallare. Dettagli e domande frequenti: <https://mailhaven.it/prezzi/>.

## Installazione

Serve una VM o un server Linux (Debian o Ubuntu) con accesso root e la porta 8080 raggiungibile. Per provarlo bastano 2 vCPU, 4 GB di RAM e 40 GB di disco; con antivirus e antispam attivi si consigliano 4 vCPU e 8 GB.

```bash
# sul server, come root
apt update && apt install -y curl
curl -fsSL https://raw.githubusercontent.com/Avidsnake92/MailHaven/main/install.sh -o mailhaven-install.sh
bash mailhaven-install.sh
```

Lo script installa Docker se manca, scarica l'ultima versione rilasciata in `/root/mailhaven` e avvia i servizi. Poi apri `http://IP-DEL-SERVER:8080`: la procedura guidata crea la chiave di cifratura (**salvala subito in un password manager**), l'utente amministratore e, se vuoi, il server per le email di notifica.

Se il server è dietro un reverse proxy, alza il limite di dimensione delle richieste ad almeno 100 MB, altrimenti import e invii con allegati grandi vengono rifiutati.

**Installazione manuale**: copia `.env.example` in `.env`, genera `JWT_SECRET` e `ENCRYPTION_KEY` con `openssl rand -hex 32`, imposta una `DB_PASSWORD` robusta, poi `docker compose up -d --build`.

## Aggiornamento

Dall'interfaccia, in *Impostazioni → Aggiornamento*. Prima viene salvata una copia del database; se dopo l'aggiornamento il servizio non riparte, si torna alla versione precedente. Le novità di ogni versione sono nel [CHANGELOG](CHANGELOG.md).

## Aprire un backup senza MailHaven

I backup S3 e NAS/SFTP sono file `.mhbak` cifrati. Se MailHaven non è disponibile, `MailHavenRestore.ps1` li apre su un PC Windows ed estrae le email in file `.eml`, una cartella per casella. Servono solo il file e la chiave di cifratura (`ENCRYPTION_KEY`, nel `.env` del server).

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/Avidsnake92/MailHaven/main/MailHavenRestore.ps1 -OutFile MailHavenRestore.ps1 -UseBasicParsing
powershell -ExecutionPolicy Bypass -File .\MailHavenRestore.ps1 -BackupFile .\mailhaven-2026-09-29T02-00-00.mhbak
```

La chiave viene chiesta a video. Tutte le opzioni: `Get-Help .\MailHavenRestore.ps1 -Full`. Guida completa: <https://mailhaven.it/documentazione/#ripristino>.

## Struttura del repository

```
MailHaven/
├── backend/         API Node.js/Express, scheduler, antivirus, schema PostgreSQL
├── frontend/        interfaccia React + Vite + Tailwind, servita da Nginx
├── plugins/         add-in per Outlook e estensione per Thunderbird
├── license-server/  server opzionale per revocare le chiavi di licenza
├── tools/           strumenti di servizio (emissione delle chiavi di licenza)
├── docker-compose.yml, install.sh, do-update.sh, ...
└── MailHavenRestore.ps1
```

I servizi sono quattro container: interfaccia web (Nginx, porta 8080), backend, PostgreSQL e Rspamd.

## Tecnologie

Node.js, Express, React, Vite, Tailwind CSS, PostgreSQL, ClamAV, Rspamd, Docker Compose.

## Licenza

MailHaven è pubblicato con la **Business Source License 1.1** (testo completo nel file [LICENSE](LICENSE)). Il codice è visibile e modificabile, ma non è "open source" nel senso della definizione OSI: l'uso in produzione ha dei limiti.

- **Liberi**: leggere, copiare e modificare il codice; usarlo per prove e sviluppo; usarlo in produzione gratuitamente entro i limiti dell'edizione Community (una azienda, fino a 25 caselle, senza le funzioni riservate alle edizioni a pagamento).
- **Con una licenza commerciale**: più aziende o più caselle, le funzioni Pro (antivirus, antispam, Legal Hold, backup, import, ricerca su tutte le caselle), l'uso da rivenditore e l'offerta di MailHaven a terzi come servizio.
- **Dopo quattro anni** dalla pubblicazione, ogni versione passa alla licenza Apache 2.0.

Per licenze commerciali e per i rivenditori usa il [modulo contatti](https://mailhaven.it/contatti/). Questa sintesi non sostituisce il testo di LICENSE, che è quello che vale.

## Sicurezza

Per segnalare una vulnerabilità vedi [SECURITY.md](SECURITY.md).

## Supporto e contatti

Per demo, listino rivenditori, licenze e assistenza all'installazione usa il [modulo contatti](https://mailhaven.it/contatti/).

Sviluppato da [K2Tech](https://k2tech.it/).
