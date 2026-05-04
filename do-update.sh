#!/bin/bash
cd /root/mailvault

echo "[Update] Fetch aggiornamenti..."
git fetch origin main

echo "[Update] Applicazione aggiornamenti..."
git reset --hard origin/main

echo "[Update] Build frontend..."
bash build-frontend.sh

echo "[Update] Riavvio backend..."
docker compose restart mailvault-backend

echo "[Update] Completato!"
