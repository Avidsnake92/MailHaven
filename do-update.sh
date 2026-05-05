#!/bin/bash
cd /root/mailhaven

echo "[Update] Fetch aggiornamenti..."
git fetch origin main

echo "[Update] Applicazione aggiornamenti..."
git reset --hard origin/main

echo "[Update] Build frontend..."
bash build-frontend.sh

echo "[Update] Riavvio backend..."
docker compose up -d mailhaven-backend

echo "[Update] Completato!"
