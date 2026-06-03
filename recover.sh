#!/bin/bash
echo "=== MailHaven Recovery ==="

# Backend files
docker cp /root/mailhaven/backend/src/index.js mailhaven-backend:/app/src/index.js
docker cp /root/mailhaven/backend/src/routes/oauth.js mailhaven-backend:/app/src/routes/oauth.js
docker cp /root/mailhaven/backend/src/routes/plugin.js mailhaven-backend:/app/src/routes/plugin.js
docker cp /root/mailhaven/backend/src/routes/emails.js mailhaven-backend:/app/src/routes/emails.js
docker cp /root/mailhaven/backend/src/routes/admin.js mailhaven-backend:/app/src/routes/admin.js
docker cp /root/mailhaven/backend/src/routes/update.js mailhaven-backend:/app/src/routes/update.js
docker cp /root/mailhaven/backend/src/services/imapCrawler.js mailhaven-backend:/app/src/services/imapCrawler.js
docker cp /root/mailhaven/backend/src/services/avBatchScanner.js mailhaven-backend:/app/src/services/avBatchScanner.js
docker cp /root/mailhaven/backend/src/services/compression.js mailhaven-backend:/app/src/services/compression.js
docker cp /root/mailhaven/backend/src/services/scheduler.js mailhaven-backend:/app/src/services/scheduler.js
docker cp /root/mailhaven/version.json mailhaven-backend:/app/version.json
docker cp /root/mailhaven/CHANGELOG.md mailhaven-backend:/app/CHANGELOG.md

# Reinstalla dipendenze mancanti
docker exec mailhaven-backend sh -c "cd /app && npm install helmet express-rate-limit 2>/dev/null"

# Riavvia
docker compose restart mailhaven-backend

# Rebuild frontend
bash /root/mailhaven/build-frontend.sh

# Logo
docker cp /root/mailhaven/frontend/public/logo.svg mailhaven-frontend:/usr/share/nginx/html/logo.svg

echo "=== Recovery completato ==="
