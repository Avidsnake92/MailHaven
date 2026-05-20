#!/bin/bash
# MailHaven � Build e deploy frontend
# Uso: bash build-frontend.sh

echo "=== MailHaven Frontend Build ==="

# Build con container Node dedicato
echo "Compilo..."
docker run --rm \
  -v ~/mailhaven/frontend:/app \
  -w /app \
  node:20-alpine \
  sh -c "npm install && npm run build 2>&1"

# Verifica che la build sia andata a buon fine
if [ ! -d ~/mailhaven/frontend/dist ]; then
  echo "ERRORE: build fallita, dist non trovato!"
  exit 1
fi

# Deploy in nginx
echo "Deploy..."
docker cp ~/mailhaven/frontend/dist/. mailhaven-frontend:/usr/share/nginx/html/
# Copia version.json nella root nginx per il polling aggiornamento
docker cp ~/mailhaven/version.json mailhaven-frontend:/usr/share/nginx/html/version.json

echo "=== Build completato! ==="
echo "Ricarica il browser in modalit� incognito."