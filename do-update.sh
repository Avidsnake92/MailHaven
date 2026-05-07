#!/bin/bash
set -e
cd /root/mailhaven

echo "[Update] Fetch aggiornamenti..."
git fetch origin main

echo "[Update] Applicazione aggiornamenti..."
git reset --hard origin/main

echo "[Update] Build frontend..."
rm -rf frontend/dist
bash build-frontend.sh

echo "[Update] Aggiornamento git status..."
if [ -d "/root/mailhaven/data/git-status.json" ]; then
  rm -rf /root/mailhaven/data/git-status.json
fi
mkdir -p /root/mailhaven/data
bash check-update.sh

echo "[Update] Ricostruzione e riavvio container..."
docker compose up -d --build mailhaven-backend mailhaven-frontend

echo "[Update] Completato!"
