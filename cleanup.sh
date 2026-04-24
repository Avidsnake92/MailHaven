#!/bin/bash
echo "=== MailHaven Cleanup ==="

# 1. Rimuovi colonna openarchiver_source_id se esiste
echo "Pulizia DB..."
docker exec -it mailvault-db psql -U mailvault -d mailvault -c "
ALTER TABLE archived_emails DROP COLUMN IF EXISTS openarchiver_source_id;
" && echo "✅ Colonna openarchiver_source_id rimossa"

# 2. Rimuovi riferimenti OpenArchiver dalle settings se presenti
docker exec -it mailvault-db psql -U mailvault -d mailvault -c "
DELETE FROM settings WHERE key LIKE 'openarchiver%';
" && echo "✅ Settings OpenArchiver rimosse"

# 3. Rimuovi axios dal container backend
echo "Pulizia dipendenze..."
docker exec -it mailvault-backend sh -c "cd /app && npm uninstall axios 2>/dev/null && echo '✅ axios rimosso'" || echo "⚠️ axios non presente"

echo ""
echo "=== Cleanup completato! ==="
