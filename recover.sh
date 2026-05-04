#!/bin/bash
echo "=== MailHaven Recovery ==="

# Backend files
docker cp /root/mailvault/backend/src/index.js mailvault-backend:/app/src/index.js
docker cp /root/mailvault/backend/src/routes/oauth.js mailvault-backend:/app/src/routes/oauth.js
docker cp /root/mailvault/backend/src/routes/plugin.js mailvault-backend:/app/src/routes/plugin.js
docker cp /root/mailvault/backend/src/routes/emails.js mailvault-backend:/app/src/routes/emails.js
docker cp /root/mailvault/backend/src/routes/admin.js mailvault-backend:/app/src/routes/admin.js
docker cp /root/mailvault/backend/src/routes/update.js mailvault-backend:/app/src/routes/update.js
docker cp /root/mailvault/backend/src/services/imapCrawler.js mailvault-backend:/app/src/services/imapCrawler.js
docker cp /root/mailvault/backend/src/services/avBatchScanner.js mailvault-backend:/app/src/services/avBatchScanner.js
docker cp /root/mailvault/backend/src/services/compression.js mailvault-backend:/app/src/services/compression.js
docker cp /root/mailvault/backend/src/services/scheduler.js mailvault-backend:/app/src/services/scheduler.js
docker cp /root/mailvault/version.json mailvault-backend:/app/version.json
docker cp /root/mailvault/CHANGELOG.md mailvault-backend:/app/CHANGELOG.md

# Reinstalla dipendenze mancanti
docker exec mailvault-backend sh -c "cd /app && npm install helmet express-rate-limit 2>/dev/null"

# Riavvia
docker compose restart mailvault-backend

# Rebuild frontend
bash /root/mailvault/build-frontend.sh

# Logo
docker cp /root/mailvault/frontend/public/logo.svg mailvault-frontend:/usr/share/nginx/html/logo.svg

echo "=== Recovery completato ==="
