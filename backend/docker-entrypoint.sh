#!/bin/sh

echo "Configurazione ClamAV..."
mkdir -p /run/clamav /var/lib/clamav
chown -R clamav:clamav /run/clamav /var/lib/clamav 2>/dev/null || true

echo "Aggiornamento database ClamAV..."
freshclam --quiet 2>/dev/null && echo "Database ClamAV aggiornato." || echo "freshclam non disponibile, continuo..."

echo "Avvio ClamAV daemon..."
clamd 2>/dev/null &
CLAMD_PID=$!

# Aspetta max 10 secondi che clamd sia pronto
for i in $(seq 1 10); do
  if clamdscan --ping 2>/dev/null; then
    echo "ClamAV daemon pronto."
    break
  fi
  sleep 1
done

echo "Avvio MailHaven backend..."
exec node src/index.js
