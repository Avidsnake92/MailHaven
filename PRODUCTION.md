# MailHaven - produzione pulita

## Flusso consigliato

1. Lavora sempre sulla macchina dev.
2. Verifica build backend/frontend.
3. Aggiorna versione e changelog.
4. Crea tag Git.
5. In produzione installa o aggiorna solo da tag.

## Prima release da dev

```bash
cd /root/mailhaven
git status
bash release.sh 0.0.85
git push origin main --tags
```

## Installazione produzione da zero

Su una macchina Debian/Ubuntu appena formattata:

```bash
apt-get update && apt-get install -y git curl
git clone https://github.com/Avidsnake92/MailHaven.git /root/mailhaven
cd /root/mailhaven
RELEASE_REF=v0.0.85 bash install.sh
```

Lo script:

- installa Docker se manca;
- genera `.env` con segreti nuovi;
- crea volumi Docker puliti;
- builda e avvia backend, frontend e PostgreSQL;
- configura cron per controllo aggiornamenti.

## Aggiornare produzione

Per aggiornare all'ultimo tag:

```bash
cd /root/mailhaven
bash do-update.sh
```

Per aggiornare a un tag preciso:

```bash
cd /root/mailhaven
bash do-update.sh v0.0.86
```

Prima dell'update viene creato un dump PostgreSQL in:

```text
/root/mailhaven/data/pre-update/
```

## Dopo installazione

1. Apri l'URL scelto durante `install.sh`.
2. Completa il setup iniziale dall'interfaccia.
3. Se usi HTTPS o reverse proxy, aggiorna in `/root/mailhaven/.env`:

```env
APP_URL=https://tuodominio.example
OAUTH_REDIRECT_BASE_URL=https://tuodominio.example
```

Poi riavvia:

```bash
docker compose up -d
```

## Segreti

Non committare mai `.env`. Se un segreto e finito in zip, GitHub o chat, consideralo compromesso e rigeneralo.
