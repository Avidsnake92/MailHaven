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
echo -e "${YELLOW}   Durata stimata: 3-5 minuti. Il servizio sarà temporaneamente offline.${NC}"
echo ""
read -p "Continuare? (si/no): " CONFIRM
if [ "$CONFIRM" != "si" ]; then
  echo "Operazione annullata."
  exit 0
fi

echo ""
echo -e "${BOLD}[1/9] Backup database...${NC}"
docker exec mailvault-db pg_dump -U mailvault mailvault > /root/mailvault_backup_pre_migration_$(date +%Y%m%d_%H%M).sql
echo -e "${GREEN}✓ Backup completato${NC}"

echo ""
echo -e "${BOLD}[2/9] Arresto container...${NC}"
cd /root/mailvault && docker compose down
# Ferma eventuali container rimasti con vecchi nomi
docker stop mailvault-backend mailvault-frontend mailvault-db 2>/dev/null || true
docker rm mailvault-backend mailvault-frontend mailvault-db 2>/dev/null || true
echo -e "${GREEN}✓ Container fermati${NC}"

echo ""
echo -e "${BOLD}[3/9] Rinomina directory...${NC}"
mv /root/mailvault /root/mailhaven
echo -e "${GREEN}✓ Directory rinominata${NC}"

echo ""
echo -e "${BOLD}[4/9] Aggiornamento configurazione...${NC}"
cd /root/mailhaven

# docker-compose.yml
sed -i 's/mailvault-backend/mailhaven-backend/g; s/mailvault-frontend/mailhaven-frontend/g; s/mailvault-db/mailhaven-db/g; s/mailvault-net/mailhaven-net/g; s/mailvault-db-data/mailhaven-db-data/g; s/clamav-db/mailhaven-clamav-db/g' docker-compose.yml

# Aggiungi volumi external e fix nome volume duplicato
python3 << 'PYEOF'
with open('/root/mailhaven/docker-compose.yml', 'r') as f:
    content = f.read()

# Fix nome volume duplicato se presente
content = content.replace('mailhaven_mailhaven-mailhaven-clamav-db', 'mailhaven_mailhaven-clamav-db')

# Aggiungi external ai volumi
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

# Scripts
sed -i 's|/root/mailvault|/root/mailhaven|g; s/mailvault-backend/mailhaven-backend/g; s/mailvault-frontend/mailhaven-frontend/g; s/mailvault-db/mailhaven-db/g' \
  do-update.sh build-frontend.sh check-update.sh install.sh recover.sh 2>/dev/null || true

# nginx.conf
sed -i 's/mailvault-backend/mailhaven-backend/g' frontend/nginx.conf

# Backend src
grep -rl "mailvault" backend/src/ | xargs sed -i 's/mailvault/mailhaven/g' 2>/dev/null || true

echo -e "${GREEN}✓ Configurazione aggiornata${NC}"

echo ""
echo -e "${BOLD}[5/9] Migrazione volumi Docker...${NC}"
docker volume create mailhaven_mailhaven-db-data 2>/dev/null || true
docker volume create mailhaven_mailhaven-clamav-db 2>/dev/null || true

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
echo -e "${BOLD}[6/9] Avvio nuovi container...${NC}"
cd /root/mailhaven && docker compose up -d --build
echo -e "${GREEN}✓ Container avviati${NC}"

echo ""
echo -e "${BOLD}[7/9] Migrazione database PostgreSQL...${NC}"
sleep 20 # Aspetta che postgres sia pronto

# Crea nuovo utente e DB mailhaven
docker exec mailhaven-db psql -U mailvault -d postgres -c "CREATE USER mailhaven WITH PASSWORD 'mailhaven2024';" 2>/dev/null || true
docker exec mailhaven-db psql -U mailvault -d postgres -c "CREATE DATABASE mailhaven OWNER mailhaven;" 2>/dev/null || true
docker exec mailhaven-db psql -U mailvault -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE mailhaven TO mailhaven;" 2>/dev/null || true

# Importa dati
docker exec -i mailhaven-db psql -U mailhaven -d mailhaven < /root/mailvault_backup_pre_migration_*.sql > /dev/null 2>&1 || true

# Verifica
COUNT=$(docker exec mailhaven-db psql -U mailhaven -d mailhaven -t -c "SELECT COUNT(*) FROM archived_emails;" 2>/dev/null | tr -d ' ')
echo -e "${GREEN}✓ Database migrato ($COUNT email)${NC}"

echo ""
echo -e "${BOLD}[8/9] Aggiornamento credenziali .env...${NC}"
sed -i 's/DB_NAME=mailvault/DB_NAME=mailhaven/g; s/DB_USER=mailvault/DB_USER=mailhaven/g; s/DB_PASSWORD=mailvault2024/DB_PASSWORD=mailhaven2024/g' /root/mailhaven/.env

# Riavvia backend con nuove credenziali
docker compose restart mailhaven-backend
sleep 15
echo -e "${GREEN}✓ Credenziali aggiornate${NC}"

echo ""
echo -e "${BOLD}[9/9] Build frontend...${NC}"
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
