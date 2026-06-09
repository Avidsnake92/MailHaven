#!/usr/bin/env bash
# do-update.sh — aggiorna MailHaven con downtime minimo
# Il DB non viene mai toccato durante il build (il volume persiste).
# Il backup è opzionale e gira in background senza bloccare l'update.

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/root/mailhaven}"
LOG="$INSTALL_DIR/data/update.log"
TRIGGER="$INSTALL_DIR/data/update.trigger"
BACKUP_DIR="$INSTALL_DIR/data/backups"

mkdir -p "$INSTALL_DIR/data" "$BACKUP_DIR"
cd "$INSTALL_DIR"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

log "=== Avvio aggiornamento MailHaven ==="
log "versione corrente: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

# ── 1. Git pull ──────────────────────────────────────────────────────────
log "git pull origin main..."
git pull origin main --quiet 2>&1 | tee -a "$LOG"
log "target: $(git rev-parse --short HEAD)"

# ── 2. Backup DB in BACKGROUND (non blocca l'update) ────────────────────
# Il volume postgres persiste tra i build — il backup è precauzionale.
# Con 3+ GB può richiedere 10-15 minuti, quindi gira in parallelo.
BACKUP_FILE="$BACKUP_DIR/db-$(date +%Y%m%d-%H%M%S).sql.gz"
log "backup DB avviato in background → $BACKUP_FILE"
(
  docker exec mailhaven-db pg_dump -U mailhaven mailhaven \
    | gzip > "$BACKUP_FILE" \
    && echo "[$(date '+%H:%M:%S')] backup completato: $BACKUP_FILE" >> "$LOG" \
    || echo "[$(date '+%H:%M:%S')] backup fallito (non bloccante)" >> "$LOG"
  # Mantieni solo gli ultimi 3 backup
  ls -t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +4 | xargs rm -f 2>/dev/null || true
) &
BACKUP_PID=$!

# ── 3. Build + restart BACKEND ───────────────────────────────────────────
log "build backend..."
docker compose up -d --build --no-deps mailhaven-backend 2>&1 | tee -a "$LOG"

# Aspetta healthy (max 120s)
log "attendo backend healthy..."
for i in $(seq 1 24); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' mailhaven-backend 2>/dev/null || echo unknown)
  if [ "$STATUS" = "healthy" ]; then
    log "backend healthy (${i}x5s)"; break
  fi
  [ "$i" = "24" ] && log "WARN: backend non healthy dopo 120s (status=$STATUS)"
  sleep 5
done

# ── 4. Build + restart FRONTEND ──────────────────────────────────────────
log "build frontend..."
docker compose up -d --build --no-deps mailhaven-frontend 2>&1 | tee -a "$LOG"

# ── 5. Aggiorna git-status.json ──────────────────────────────────────────
bash "$INSTALL_DIR/check-update.sh" 2>&1 | tee -a "$LOG" || true

# Rimuovi trigger
rm -f "$TRIGGER"

log "=== Aggiornamento completato ==="
log "backup DB in corso in background (PID $BACKUP_PID) — non chiudere il terminale se vuoi aspettarlo"
log "oppure: wait $BACKUP_PID && echo 'backup done'"
