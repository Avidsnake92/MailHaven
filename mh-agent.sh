#!/usr/bin/env bash
# ============================================================================
# mh-agent.sh — agente host UNICO per gli aggiornamenti MailHaven.
# Eseguito ogni minuto dal cron. Sostituisce i due cron separati (check + trigger).
#
#   bash mh-agent.sh            → un "tick": heartbeat + verifica + esecuzione update
#   bash mh-agent.sh install    → installa/ripara il cron (una sola riga, idempotente)
#
# Stato/diagnostica scritti in data/:
#   agent-heartbeat   epoch dell'ultimo tick  (il backend lo usa per dire "motore attivo")
#   last-check        epoch dell'ultima verifica periodica
#   check.trigger     richiesta di verifica dall'app  → esegue check-update.sh
#   update.trigger    richiesta di aggiornamento dall'app → esegue do-update.sh
# ============================================================================
set -uo pipefail
INSTALL_DIR="${INSTALL_DIR:-/root/mailhaven}"
DATA="$INSTALL_DIR/data"
CHECK_EVERY=1800   # verifica periodica ogni 30 min
mkdir -p "$DATA"

self_install() {
  local line="* * * * * INSTALL_DIR=$INSTALL_DIR bash $INSTALL_DIR/mh-agent.sh >> $DATA/agent.log 2>&1"
  # Rimuove l'eventuale riga agente e i VECCHI cron separati, poi reinserisce la singola riga
  local cur
  cur="$(crontab -l 2>/dev/null | grep -v 'mh-agent.sh' | grep -v 'mailhaven/check-update.sh' | grep -v 'mailhaven/data/update.trigger' | grep -v 'update-watcher.sh' || true)"
  printf '%s\n%s\n' "$cur" "$line" | grep -v '^[[:space:]]*$' | crontab -
  echo "[mh-agent] cron installato:"
  crontab -l 2>/dev/null | grep 'mh-agent.sh'
  exit 0
}
[ "${1:-}" = "install" ] && self_install

cd "$INSTALL_DIR" 2>/dev/null || exit 1

# 1) Heartbeat (il backend lo legge per sapere se il motore è vivo)
date +%s > "$DATA/agent-heartbeat"

# 2) Verifica esplicita richiesta dall'app
if [ -f "$DATA/check.trigger" ]; then
  rm -f "$DATA/check.trigger"
  bash "$INSTALL_DIR/check-update.sh" >/dev/null 2>&1 || true
  date +%s > "$DATA/last-check"
fi

# 3) Aggiornamento richiesto dall'app (consuma il trigger una sola volta)
if [ -f "$DATA/update.trigger" ]; then
  if mv "$DATA/update.trigger" "$DATA/update.trigger.running" 2>/dev/null; then
    bash "$INSTALL_DIR/do-update.sh" > "$DATA/update.log" 2>&1 || true
    rm -f "$DATA/update.trigger.running"
    date +%s > "$DATA/last-check"
  fi
fi

# 4) Verifica periodica (se non già fatta di recente)
now=$(date +%s)
last=0
[ -f "$DATA/last-check" ] && last=$(cat "$DATA/last-check" 2>/dev/null || echo 0)
if [ $(( now - last )) -ge "$CHECK_EVERY" ]; then
  echo "$now" > "$DATA/last-check"   # marca subito per non ripartire ogni minuto
  bash "$INSTALL_DIR/check-update.sh" >/dev/null 2>&1 || true
fi
