# MailHaven — Email Archiving

Sistema di archiviazione email IMAP standalone sviluppato da **K2Tech**.

## Requisiti
- Docker + Docker Compose
- Accesso a server IMAP

## Installazione

```bash
# 1. Clona la repo
git clone https://github.com/Avidsnake92/MailHaven.git
cd MailHaven

# 2. Copia e configura il .env
cp .env.example .env
# Modifica DB_PASSWORD con una password sicura

# 3. Avvia
docker compose up -d --build
```

## Primo avvio

Apri il browser su `http://IP_SERVER:8080` — il wizard di configurazione guiderà nella creazione dell'account amministratore e nella generazione delle chiavi di sicurezza.

## Struttura

```
MailHaven/
├── backend/          # Node.js API
│   ├── src/
│   │   ├── routes/   # API routes
│   │   ├── services/ # IMAP crawler, AV, crypto
│   │   └── db/       # Schema PostgreSQL
│   └── Dockerfile
├── frontend/         # React + Vite + Tailwind
│   └── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Aprire un backup senza MailHaven

I backup S3 e NAS/SFTP sono file `.mhbak` cifrati. Se MailHaven non e' disponibile,
`MailHavenRestore.ps1` li apre su qualunque PC Windows ed estrae le email in file `.eml`
(una cartella per casella). Serve solo il file e la chiave di cifratura (`ENCRYPTION_KEY`
nel `.env`).

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/Avidsnake92/MailHaven/main/MailHavenRestore.ps1 -OutFile MailHavenRestore.ps1 -UseBasicParsing
powershell -ExecutionPolicy Bypass -File .\MailHavenRestore.ps1 -BackupFile .\mailhaven-2026-09-29T02-00-00.mhbak
```

La chiave viene chiesta a video. `Get-Help .\MailHavenRestore.ps1 -Full` per tutte le opzioni.

## Tecnologie
- **Backend:** Node.js, Express, PostgreSQL
- **Frontend:** React, Vite, Tailwind CSS
- **Archivio:** PostgreSQL con compressione gzip
- **Antivirus:** ClamAV
- **IMAP:** node-imap, mailparser

## by K2Tech — k2tech.it
