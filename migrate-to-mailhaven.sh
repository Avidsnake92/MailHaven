#!/bin/bash
# MailHaven — Script migrazione da mailvault a mailhaven
# Uso: bash migrate-to-mailhaven.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BLUE}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}${BOLD}║   MailHaven — Migrazione mailvault→mailhaven ║${NC}"
echo -e "${BLUE}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Verifica che siamo in root
if [ "$HOME" != "/root" ]; then
  echo -e "${RED}Esegui come root!${NC}"
  exit 1
fi

# Verifica che la directory mailvault esista
if [ ! -d "/root/mailvault" ]; then
  echo -e "${RED}Directory /root/mailvault non trovata!${NC}"
  exit 1
fi

# Verifica che mailhaven NON esista già
if [ -d "/root/mailhaven" ]; then
  echo -e "${RED}Directory /root/mailhaven già esistente! Migrazione già eseguita?${NC}"
  exit 1
fi

echo -e "${YELLOW}⚠️  Questa operazione migrerà tutto il sistema da mailvault a mailhaven.${NC}"
echo -e "${YELLOW}   Durata stimata: 2-3 minuti. Il servizio sarà temporaneamente offline.${NC}"
echo ""
read -p "Continuare? (si/no): " CONFIRM
if [ "$CONFIRM" != "si" ]; then
  echo "Operazione annullata."
  exit 0
fi

echo ""
echo -e "${BOLD}[1/8] Backup database...${NC}"
docker exec mailvault-db pg_dump -U mailvault mailvault > /root/mailvault_backup_pre_migration_$(date +%Y%m%d_%H%M).sql
echo -e "${GREEN}✓ Backup completato${NC}"

echo ""
echo -e "${BOLD}[2/8] Arresto container...${NC}"
cd /root/mailvault && docker compose down
echo -e "${GREEN}✓ Container fermati${NC}"

echo ""
echo -e "${BOLD}[3/8] Rinomina directory...${NC}"
mv /root/mailvault /root/mailhaven
echo -e "${GREEN}✓ Directory rinominata${NC}"

echo ""
echo -e "${BOLD}[4/8] Aggiornamento configurazione...${NC}"
cd /root/mailhaven

# docker-compose.yml
sed -i 's/mailvault-backend/mailhaven-backend/g; s/mailvault-frontend/mailhaven-frontend/g; s/mailvault-db/mailhaven-db/g; s/mailvault-net/mailhaven-net/g; s/mailvault-db-data/mailhaven-db-data/g; s/clamav-db/mailhaven-clamav-db/g' docker-compose.yml

# Aggiungi volumi external
cat > /tmp/volumes_patch.py << 'PYEOF'
with open('/root/mailhaven/docker-compose.yml', 'r') as f:
    content = f.read()
old = "volumes:\n  mailhaven-db-data:\n  mailhaven-clamav-db:"
new = """volumes:
  mailhaven-db-data:
    external: true
    name: mailhaven_mailhaven-db-data
  mailhaven-clamav-db:
    external: true
    name: mailhaven_mailhaven-clamav-db"""
content = content.replace(old, new)
with open('/root/mailhaven/docker-compose.yml', 'w') as f:
    f.write(content)
print("OK")
PYEOF
python3 /tmp/volumes_patch.py

# Scripts
sed -i 's|/root/mailvault|/root/mailhaven|g; s/mailvault-backend/mailhaven-backend/g; s/mailvault-frontend/mailhaven-frontend/g; s/mailvault-db/mailhaven-db/g' \
  do-update.sh build-frontend.sh check-update.sh install.sh recover.sh 2>/dev/null || true

# nginx.conf
sed -i 's/mailvault-backend/mailhaven-backend/g' frontend/nginx.conf

# Backend src
grep -rl "mailvault" backend/src/ | xargs sed -i 's/mailvault/mailhaven/g' 2>/dev/null || true

# .env
sed -i 's/DB_NAME=mailvault/DB_NAME=mailhaven/g; s/DB_USER=mailvault/DB_USER=mailhaven/g; s/DB_PASSWORD=mailvault2024/DB_PASSWORD=mailhaven2024/g' .env

echo -e "${GREEN}✓ Configurazione aggiornata${NC}"

echo ""
echo -e "${BOLD}[5/8] Migrazione volumi Docker...${NC}"
docker volume create mailhaven_mailhaven-db-data
docker volume create mailhaven_mailhaven-clamav-db

# Copia DB data
docker run --rm \
  -v mailvault_mailvault-db-data:/from \
  -v mailhaven_mailhaven-db-data:/to \
  alpine sh -c "cp -a /from/. /to/" 2>/dev/null || \
docker run --rm \
  -v mailvault_mailhaven-db-data:/from \
  -v mailhaven_mailhaven-db-data:/to \
  alpine sh -c "cp -a /from/. /to/" 2>/dev/null || true

# Copia ClamAV data
docker run --rm \
  -v mailvault_clamav-db:/from \
  -v mailhaven_mailhaven-clamav-db:/to \
  alpine sh -c "cp -a /from/. /to/" 2>/dev/null || true

echo -e "${GREEN}✓ Volumi migrati${NC}"

echo ""
echo -e "${BOLD}[6/8] Avvio nuovi container...${NC}"
cd /root/mailhaven && docker compose up -d --build
echo -e "${GREEN}✓ Container avviati${NC}"

echo ""
echo -e "${BOLD}[7/8] Migrazione database...${NC}"
sleep 15 # Aspetta che postgres sia pronto

# Crea nuovo utente e DB
docker exec mailhaven-db psql -U mailvault -d postgres -c "CREATE USER mailhaven WITH PASSWORD 'mailhaven2024';" 2>/dev/null || true
docker exec mailhaven-db psql -U mailvault -d postgres -c "CREATE DATABASE mailhaven OWNER mailhaven;" 2>/dev/null || true
docker exec mailhaven-db psql -U mailvault -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE mailhaven TO mailhaven;" 2>/dev/null || true

# Importa dati
docker exec -i mailhaven-db psql -U mailhaven -d mailhaven < /root/mailvault_backup_pre_migration_*.sql > /dev/null 2>&1 || true

# Verifica
COUNT=$(docker exec mailhaven-db psql -U mailhaven -d mailhaven -t -c "SELECT COUNT(*) FROM archived_emails;" 2>/dev/null | tr -d ' ')
echo -e "${GREEN}✓ Database migrato ($COUNT email)${NC}"

echo ""
echo -e "${BOLD}[8/8] Build frontend...${NC}"
bash /root/mailhaven/build-frontend.sh > /dev/null 2>&1
echo -e "${GREEN}✓ Frontend aggiornato${NC}"

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   Migrazione completata con successo! 🎉  ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Accesso:${NC} http://$(hostname -I | awk '{print $1}'):8080"
echo -e "  ${BOLD}Backup pre-migrazione:${NC} /root/mailvault_backup_pre_migration_*.sql"
echo ""
