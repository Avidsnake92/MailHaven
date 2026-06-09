#!/usr/bin/env bash
# do-update.sh — aggiorna MailHaven con downtime minimo
# Sequenza: git pull → build backend → wait healthy → build frontend
# Il frontend continua a servire (anche con 502 → pagina manutenzione)
# durante il restart del backend (~30-60s).

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/root/mailhaven}"
LOG="$INSTALL_DIR/data/update.log"
TRIGGER="$INSTALL_DIR/data/update.trigger"

mkdir -p "$INSTALL_DIR/data"
cd "$INSTALL_DIR"

echo "[$(date '+%H:%M:%S')] === Avvio aggiornamento MailHaven ===" | tee -a "$LOG"

# ── 1. Git pull ──────────────────────────────────────────────────────────
echo "[$(date '+%H:%M:%S')] git pull origin main..." | tee -a "$LOG"
git pull origin main --quiet 2>&1 | tee -a "$LOG"

# ── 2. Build + restart BACKEND ───────────────────────────────────────────
echo "[$(date '+%H:%M:%S')] Build backend..." | tee -a "$LOG"
docker compose up -d --build --no-deps mailhaven-backend 2>&1 | tee -a "$LOG"

# Aspetta che il backend sia healthy (max 120s)
echo "[$(date '+%H:%M:%S')] Attendo che il backend sia healthy..." | tee -a "$LOG"
for i in $(seq 1 24); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' mailhaven-backend 2>/dev/null || echo "unknown")
  if [ "$STATUS" = "healthy" ]; then
    echo "[$(date '+%H:%M:%S')] Backend healthy dopo ${i}x5s." | tee -a "$LOG"
    break
  fi
  if [ "$i" = "24" ]; then
    echo "[$(date '+%H:%M:%S')] WARN: backend non healthy dopo 120s (status=$STATUS), continuo comunque." | tee -a "$LOG"
  fi
  sleep 5
done

# ── 3. Build + restart FRONTEND ──────────────────────────────────────────
echo "[$(date '+%H:%M:%S')] Build frontend..." | tee -a "$LOG"
docker compose up -d --build --no-deps mailhaven-frontend 2>&1 | tee -a "$LOG"

# ── 4. Aggiorna git-status.json ──────────────────────────────────────────
bash "$INSTALL_DIR/check-update.sh" 2>&1 | tee -a "$LOG" || true

# ── 5. Rimuovi trigger ───────────────────────────────────────────────────
rm -f "$TRIGGER"

echo "[$(date '+%H:%M:%S')] === Aggiornamento completato ===" | tee -a "$LOG"
