#!/bin/bash
cd /root/mailhaven

echo "[Update] Fetch aggiornamenti..."
git fetch origin main

echo "[Update] Applicazione aggiornamenti..."
git reset --hard origin/main

echo "[Update] Build frontend..."
rm -rf frontend/dist
bash build-frontend.sh

echo "[Update] Aggiornamento git status..."
# Assicura che git-status.json sia un file e non una directory
if [ -d "/root/mailhaven/data/git-status.json" ]; then
  rm -rf /root/mailhaven/data/git-status.json
  echo '{"currentCommit":"unknown","remoteCommit":"unknown","commitsBehind":0,"latestCommits":[]}' > /root/mailhaven/data/git-status.json
fi
if [ ! -f "/root/mailhaven/data/git-status.json" ]; then
  mkdir -p /root/mailhaven/data
  echo '{"currentCommit":"unknown","remoteCommit":"unknown","commitsBehind":0,"latestCommits":[]}' > /root/mailhaven/data/git-status.json
fi
# Assicura che git-status.json sia un file e non una directory
if [ -d "/root/mailhaven/data/git-status.json" ]; then
  rm -rf /root/mailhaven/data/git-status.json
  echo '{"currentCommit":"unknown","remoteCommit":"unknown","commitsBehind":0,"latestCommits":[]}' > /root/mailhaven/data/git-status.json
fi
if [ ! -f "/root/mailhaven/data/git-status.json" ]; then
  mkdir -p /root/mailhaven/data
  echo '{"currentCommit":"unknown","remoteCommit":"unknown","commitsBehind":0,"latestCommits":[]}' > /root/mailhaven/data/git-status.json
fi
sleep 30
bash check-update.sh

echo "[Update] Riavvio backend..."
docker compose up -d mailhaven-backend

echo "[Update] Completato!"
