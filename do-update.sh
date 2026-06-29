#!/usr/bin/env bash
# do-update.sh — aggiorna MailHaven con downtime minimo
# Il DB non viene mai toccato durante il build (il volume persiste).
# Il backup è opzionale e gira in background senza bloccare l'update.

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/root/mailhaven}"
LOG="$INSTALL_DIR/data/update.log"
TRIGGER="$INSTALL_DIR/data/update.trigger"
BACKUP_DIR="$INSTALL_DIR/data/backups"
STATUS_FILE="$INSTALL_DIR/data/update-status.json"

mkdir -p "$INSTALL_DIR/data" "$BACKUP_DIR"
cd "$INSTALL_DIR"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

# Scrive lo stato corrente, letto dal frontend per la barra di progresso reale
set_status() {
  local step="$1" progress="$2" message="$3"
  printf '{"step":"%s","progress":%s,"message":"%s","ts":"%s"}\n' \
    "$step" "$progress" "$message" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATUS_FILE"
}

on_error() {
  set_status "error" 0 "Aggiornamento fallito, controlla i log"
}
trap on_error ERR

# Self-heal: il file di stato DEVE essere un file regolare. Un vecchio mount ":ro"
# poteva crearlo come directory → do-update.sh moriva con "Is a directory".
if [ -d "$STATUS_FILE" ]; then
  docker compose stop mailhaven-frontend >/dev/null 2>&1 || true
  rm -rf "$STATUS_FILE"
fi
[ -e "$STATUS_FILE" ] || : > "$STATUS_FILE" 2>/dev/null || true

log "=== Avvio aggiornamento MailHaven ==="
log "versione corrente: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
set_status "pull" 5 "Scaricamento aggiornamenti..."

# ── 1. Allinea il codice a origin/main (robusto) ─────────────────────────
log "allineo il repository a origin/main..."
# Accesso a GitHub: se il fetch fallisce prova col token da .env
if ! git fetch --quiet origin main 2>>"$LOG"; then
  TOKEN=$(grep -E '^GITHUB_TOKEN=' "$INSTALL_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d ' "' || true)
  RU=$(git remote get-url origin 2>/dev/null || echo "")
  if [ -n "${TOKEN:-}" ] && echo "$RU" | grep -q 'github.com'; then
    AU=$(echo "$RU" | sed -E 's#https://[^@]*@#https://#')
    AU=$(echo "$AU" | sed "s#https://#https://${TOKEN}@#")
    git remote set-url origin "$AU"
    git fetch --quiet origin main 2>>"$LOG"
  fi
fi
# Mette da parte eventuali modifiche locali (non blocca l'allineamento)
if [ -n "$(git status --porcelain)" ]; then
  git stash push -u -m "do-update $(date +%Y%m%d-%H%M%S)" >/dev/null 2>&1 || true
  log "modifiche locali messe da parte (git stash)"
fi
git checkout main --quiet 2>/dev/null || git checkout -B main origin/main --quiet
git reset --hard origin/main --quiet
log "target: $(git rev-parse --short HEAD)"
set_status "pull" 10 "Aggiornamenti scaricati"

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
set_status "backend_build" 20 "Compilazione backend..."
docker compose up -d --build --no-deps mailhaven-backend 2>&1 | tee -a "$LOG"
set_status "backend_restart" 50 "Riavvio backend..."

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
set_status "backend_restart" 60 "Backend riavviato"

# ── 4. Build + restart FRONTEND ──────────────────────────────────────────
log "build frontend..."
set_status "frontend_build" 70 "Compilazione frontend..."
docker compose up -d --build --no-deps mailhaven-frontend 2>&1 | tee -a "$LOG"
set_status "frontend_build" 95 "Frontend aggiornato"

# ── 5. Aggiorna git-status.json ──────────────────────────────────────────
bash "$INSTALL_DIR/check-update.sh" 2>&1 | tee -a "$LOG" || true

# Rimuovi trigger
rm -f "$TRIGGER"

set_status "done" 100 "Aggiornamento completato con successo"

log "=== Aggiornamento completato ==="
log "backup DB in corso in background (PID $BACKUP_PID) — non chiudere il terminale se vuoi aspettarlo"
log "oppure: wait $BACKUP_PID && echo 'backup done'"
