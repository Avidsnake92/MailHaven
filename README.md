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

## Tecnologie
- **Backend:** Node.js, Express, PostgreSQL
- **Frontend:** React, Vite, Tailwind CSS
- **Archivio:** PostgreSQL con compressione gzip
- **Antivirus:** ClamAV
- **IMAP:** node-imap, mailparser

## by K2Tech — k2tech.it
