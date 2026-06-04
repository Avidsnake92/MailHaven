#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/root/mailhaven}"
LOG="$INSTALL_DIR/data/update.log"
TARGET_REF="${1:-${RELEASE_REF:-}}"

mkdir -p "$INSTALL_DIR/data"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
die() { log "ERRORE: $*"; exit 1; }

cd "$INSTALL_DIR" || die "directory $INSTALL_DIR non trovata"
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

log "=== Avvio aggiornamento MailHaven ==="
git fetch --tags origin >> "$LOG" 2>&1 || die "git fetch fallito"

if [ -z "$TARGET_REF" ]; then
  TARGET_REF="$(git tag --sort=-v:refname | head -n 1 || true)"
fi
[ -n "$TARGET_REF" ] || TARGET_REF="origin/main"

CURRENT_REF="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
log "versione corrente: $CURRENT_REF"
log "target update: $TARGET_REF"

BACKUP_DIR="$INSTALL_DIR/data/pre-update"
mkdir -p "$BACKUP_DIR"
if docker compose ps --status running mailhaven-db >/dev/null 2>&1; then
  BACKUP_FILE="$BACKUP_DIR/db-$(date '+%Y%m%d-%H%M%S').sql.gz"
  log "backup database: $BACKUP_FILE"
  docker compose exec -T mailhaven-db pg_dump -U "${DB_USER:-mailhaven}" "${DB_NAME:-mailhaven}" | gzip > "$BACKUP_FILE" || die "backup database fallito"
fi

git fetch --tags origin >> "$LOG" 2>&1
git checkout main >> "$LOG" 2>&1 || git checkout -B main origin/main >> "$LOG" 2>&1
git reset --hard "$TARGET_REF" >> "$LOG" 2>&1 || die "reset a $TARGET_REF fallito"
git branch --set-upstream-to=origin/main main >> "$LOG" 2>&1 || true

log "build immagini"
docker compose build --pull >> "$LOG" 2>&1 || die "docker compose build fallito"

log "riavvio stack"
docker compose up -d >> "$LOG" 2>&1 || die "docker compose up fallito"

log "aggiorno stato release"
bash "$INSTALL_DIR/check-update.sh" >> "$LOG" 2>&1 || true

VTAG=$(git describe --tags --abbrev=0 2>/dev/null || echo v0.0.0)
VVER=${VTAG#v}
VBUILD=$(date +%Y%m%d)
printf '{"version": "%s", "build": "%s"}
' "$VVER" "$VBUILD" > "$INSTALL_DIR/version.json"
log "version.json aggiornato: $VVER"
log "=== Aggiornamento completato ==="
