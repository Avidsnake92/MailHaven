#!/bin/sh
# ClamAV viene configurato/aggiornato IN BACKGROUND: non deve mai bloccare
# l'avvio del backend. Su un'installazione pulita freshclam scarica ~300MB e ci
# mette minuti: se fosse bloccante, il wizard/login non partirebbero finché non
# finisce (e il frontend, che dipende dal backend "healthy", resterebbe giù).
# Così invece Node parte subito e l'antivirus diventa disponibile poco dopo.
(
  echo "Configurazione ClamAV (in background)..."
  mkdir -p /run/clamav /var/lib/clamav
  chown -R clamav:clamav /run/clamav /var/lib/clamav 2>/dev/null || true
  echo "Aggiornamento database ClamAV (in background)..."
  freshclam --quiet 2>/dev/null && echo "Database ClamAV aggiornato." || echo "freshclam non disponibile, continuo..."
  echo "Avvio ClamAV daemon..."
  clamd 2>/dev/null &
) &

echo "Avvio MailHaven backend..."
exec node src/index.js
