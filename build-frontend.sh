#!/bin/bash
# MailHaven — Build e deploy frontend
# Uso: bash build-frontend.sh

echo "=== MailHaven Frontend Build ==="

# Copia sorgenti nel container backend
echo "Copio sorgenti..."
docker exec mailvault-backend rm -rf /tmp/frontend
docker cp /root/mailvault/frontend mailvault-backend:/tmp/frontend

# Build
echo "Compilo..."
docker exec mailvault-backend sh -c "cd /tmp/frontend && npm install --include=dev && npm run build"

# Deploy
echo "Deploy..."
docker cp mailvault-backend:/tmp/frontend/dist /root/frontend-dist-tmp
docker cp /root/frontend-dist-tmp/. mailvault-frontend:/usr/share/nginx/html/
rm -rf /root/frontend-dist-tmp

echo "=== Build completato! ==="
echo "Ricarica il browser in modalità incognito."
