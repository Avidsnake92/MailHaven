#!/bin/bash
# MailHaven — Script aggiornamento automatico

LOG="/root/mailhaven/data/update.log"
INSTALL_DIR="/root/mailhaven"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"; }

log "=== Avvio aggiornamento MailHaven ==="

cd "$INSTALL_DIR" || { log "ERRORE: directory $INSTALL_DIR non trovata"; exit 1; }

# 1. Fetch aggiornamenti
log "Fetch aggiornamenti dal repository..."
if ! git fetch origin main 2>> "$LOG"; then
  log "ERRORE: git fetch fallito — verifica connessione e token GitHub"
  exit 1
fi

# 2. Applica aggiornamenti
log "Applicazione aggiornamenti..."
if ! git reset --hard origin/main >> "$LOG" 2>&1; then
  log "ERRORE: git reset fallito"
  exit 1
fi

# 3. Rebuild backend con --no-cache
log "Rebuild backend..."
if ! docker compose build --no-cache mailhaven-backend >> "$LOG" 2>&1; then
  log "ERRORE: build backend fallita"
  exit 1
fi
if ! docker compose up -d mailhaven-backend >> "$LOG" 2>&1; then
  log "ERRORE: avvio backend fallito"
  exit 1
fi

# 4. Build frontend
log "Build frontend..."
if ! bash "$INSTALL_DIR/build-frontend.sh" >> "$LOG" 2>&1; then
  log "ERRORE: build frontend fallita"
  exit 1
fi

# 5. Aggiorna git-status.json
log "Aggiornamento git status..."
bash "$INSTALL_DIR/check-update.sh" 2>> "$LOG"

# 6. Riconfigura cron
CRON_CHECK="*/30 * * * * bash /root/mailhaven/check-update.sh >> /root/mailhaven/data/check-update.log 2>&1"
CRON_TRIGGER="* * * * * if [ -f /root/mailhaven/data/update.trigger ]; then rm -f /root/mailhaven/data/update.trigger && bash /root/mailhaven/do-update.sh > /root/mailhaven/data/update.log 2>&1; fi"
(crontab -l 2>/dev/null | grep -v 'check-update.sh' | grep -v 'update.trigger'; echo "$CRON_CHECK"; echo "$CRON_TRIGGER") | crontab -

log "=== Aggiornamento completato con successo ==="
