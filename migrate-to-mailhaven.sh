#!/bin/bash
# MailHaven — Script migrazione da mailvault a mailhaven
# Uso: bash migrate-to-mailhaven.sh

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

# Verifica root
if [ "$HOME" != "/root" ]; then
  echo -e "${RED}Esegui come root!${NC}"; exit 1
fi

# Verifica directory
if [ ! -d "/root/mailvault" ]; then
  echo -e "${RED}Directory /root/mailvault non trovata!${NC}"; exit 1
fi
if [ -d "/root/mailhaven" ]; then
  echo -e "${RED}Directory /root/mailhaven già esistente! Migrazione già eseguita?${NC}"; exit 1
fi

# Leggi credenziali dal .env esistente
ENV_FILE="/root/mailvault/.env"
OLD_DB_NAME=$(grep "^DB_NAME=" "$ENV_FILE" | cut -d= -f2)
OLD_DB_USER=$(grep "^DB_USER=" "$ENV_FILE" | cut -d= -f2)
OLD_DB_PASSWORD=$(grep "^DB_PASSWORD=" "$ENV_FILE" | cut -d= -f2)

echo -e "Database attuale: ${BOLD}$OLD_DB_NAME${NC} (utente: ${BOLD}$OLD_DB_USER${NC})"
echo ""
echo -e "${YELLOW}⚠️  Questa operazione migrerà tutto il sistema da mailvault a mailhaven.${NC}"
echo -e "${YELLOW}   Durata stimata: 3-5 minuti. Il servizio sarà temporaneamente offline.${NC}"
echo ""
read -p "Continuare? (si/no): " CONFIRM
if [ "$CONFIRM" != "si" ]; then echo "Operazione annullata."; exit 0; fi

echo ""
echo -e "${BOLD}[1/9] Backup database...${NC}"
BACKUP_FILE="/root/mailvault_backup_pre_migration_$(date +%Y%m%d_%H%M).sql"
if docker exec mailvault-db pg_dump -U "$OLD_DB_USER" "$OLD_DB_NAME" > "$BACKUP_FILE" 2>/dev/null; then
  echo -e "${GREEN}✓ Backup completato: $BACKUP_FILE${NC}"
else
  echo -e "${YELLOW}⚠ Backup fallito — continuo comunque${NC}"
fi

echo ""
echo -e "${BOLD}[2/9] Arresto container...${NC}"
cd /root/mailvault && docker compose down 2>/dev/null || true
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

# Fix volumi e aggiungi external
python3 << 'PYEOF'
with open('/root/mailhaven/docker-compose.yml', 'r') as f:
    content = f.read()
content = content.replace('mailhaven_mailhaven-mailhaven-clamav-db', 'mailhaven_mailhaven-clamav-db')
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
sed -i 's/mailvault-backend/mailhaven-backend/g' frontend/nginx.conf 2>/dev/null || true

# Backend src
grep -rl "mailvault" backend/src/ | xargs sed -i 's/mailvault/mailhaven/g' 2>/dev/null || true

# .env — aggiorna con nuove credenziali mailhaven
sed -i "s/^DB_NAME=.*/DB_NAME=mailhaven/" .env
sed -i "s/^DB_USER=.*/DB_USER=mailhaven/" .env
sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=mailhaven2024/" .env

echo -e "${GREEN}✓ Configurazione aggiornata${NC}"

echo ""
echo -e "${BOLD}[5/9] Migrazione volumi Docker...${NC}"
docker volume create mailhaven_mailhaven-db-data 2>/dev/null || true
docker volume create mailhaven_mailhaven-clamav-db 2>/dev/null || true

# Copia dati DB nel nuovo volume
docker run --rm \
  -v mailvault_mailvault-db-data:/from \
  -v mailhaven_mailhaven-db-data:/to \
  alpine sh -c "cp -a /from/. /to/" 2>/dev/null || \
docker run --rm \
  -v mailvault_mailhaven-db-data:/from \
  -v mailhaven_mailhaven-db-data:/to \
  alpine sh -c "cp -a /from/. /to/" 2>/dev/null || true

# Copia ClamAV
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
sleep 20

# Crea utente mailhaven usando le credenziali vecchie
docker exec mailhaven-db psql -U "$OLD_DB_USER" -d postgres -c "CREATE USER mailhaven WITH PASSWORD 'mailhaven2024';" 2>/dev/null || true
docker exec mailhaven-db psql -U "$OLD_DB_USER" -d postgres -c "CREATE DATABASE mailhaven OWNER mailhaven;" 2>/dev/null || true
docker exec mailhaven-db psql -U "$OLD_DB_USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE mailhaven TO mailhaven;" 2>/dev/null || true

# Importa backup nel nuovo DB
if [ -f "$BACKUP_FILE" ]; then
  docker exec -i mailhaven-db psql -U mailhaven -d mailhaven < "$BACKUP_FILE" > /dev/null 2>&1 || true
  # Dai permessi su tutte le tabelle
  docker exec mailhaven-db psql -U "$OLD_DB_USER" -d mailhaven -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO mailhaven;" 2>/dev/null || true
  docker exec mailhaven-db psql -U "$OLD_DB_USER" -d mailhaven -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO mailhaven;" 2>/dev/null || true
fi

# Verifica
COUNT=$(docker exec mailhaven-db psql -U mailhaven -d mailhaven -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' \n')
echo -e "${GREEN}✓ Database migrato ($COUNT utenti trovati)${NC}"

echo ""
echo -e "${BOLD}[8/9] Aggiornamento credenziali e riavvio backend...${NC}"
docker compose restart mailhaven-backend
sleep 20
echo -e "${GREEN}✓ Backend riavviato${NC}"

echo ""
echo -e "${BOLD}[9/9] Build frontend...${NC}"
bash /root/mailhaven/build-frontend.sh > /dev/null 2>&1
bash /root/mailhaven/check-update.sh > /dev/null 2>&1
echo -e "${GREEN}✓ Frontend aggiornato${NC}"

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   Migrazione completata con successo! 🎉  ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Accesso:${NC} http://$(hostname -I | awk '{print $1}'):8080"
echo -e "  ${BOLD}Backup pre-migrazione:${NC} $BACKUP_FILE"
echo -e "  ${YELLOW}Le credenziali di login rimangono invariate.${NC}"
echo ""
