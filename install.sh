#!/bin/bash
# MailHaven — Installer
# Uso: bash install.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BLUE}${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}${BOLD}║       MailHaven — Installer          ║${NC}"
echo -e "${BLUE}${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Controlla Docker ──
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Docker non trovato. Installazione in corso...${NC}"
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo -e "${GREEN}✓ Docker installato!${NC}"
else
  echo -e "${GREEN}✓ Docker trovato: $(docker --version)${NC}"
fi

if ! docker compose version &> /dev/null; then
  echo -e "${RED}Docker Compose non trovato.${NC}"
  exit 1
fi

# ── Clona il repo ──
echo ""
echo -e "${BOLD}── Configurazione repository ──${NC}"
echo -e "Inserisci il tuo GitHub Personal Access Token (repo privato):"
read -s GITHUB_TOKEN
echo ""

REPO_URL="https://${GITHUB_TOKEN}@github.com/Avidsnake92/MailHaven.git"
INSTALL_DIR="/root/mailhaven"

if [ -d "$INSTALL_DIR" ]; then
  echo -e "${YELLOW}Directory $INSTALL_DIR già esistente. Aggiorno il repo...${NC}"
  cd "$INSTALL_DIR"
  git remote set-url origin "$REPO_URL"
  git fetch origin main
  git reset --hard origin/main
else
  echo -e "Clono il repository in $INSTALL_DIR..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi
echo -e "${GREEN}✓ Repository pronto${NC}"

# ── Genera chiavi casuali ──
generate_key() {
  openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1
}

JWT_SECRET=$(generate_key)
ENCRYPTION_KEY=$(generate_key)

# ── Modalità installazione ──
echo ""
echo -e "${BOLD}── Modalità installazione ──${NC}"
echo -e "  ${GREEN}1)${NC} Base     — configurazione automatica (consigliata)"
echo -e "  ${YELLOW}2)${NC} Avanzata — configura manualmente DB, SMTP, OAuth2"
echo ""
read -p "Scegli [1]: " INSTALL_MODE
INSTALL_MODE=${INSTALL_MODE:-1}

if [ "$INSTALL_MODE" = "1" ]; then
  # ── MODALITÀ BASE ──
  echo ""
  echo -e "${GREEN}${BOLD}── Installazione Base ──${NC}"

  DB_NAME="mailhaven"
  DB_USER="mailhaven"
  DB_PASSWORD=$(generate_key | cut -c1-24)

 LOCAL_IP=$(hostname -I | awk '{print $1}')
read -p "URL di accesso (es. https://mail.tuodominio.it) [http://${LOCAL_IP}:8080]: " OAUTH_REDIRECT_BASE_URL
OAUTH_REDIRECT_BASE_URL=${OAUTH_REDIRECT_BASE_URL:-http://${LOCAL_IP}:8080}

  SMTP_HOST=""
  SMTP_PORT="587"
  SMTP_SECURE="false"
  SMTP_USER=""
  SMTP_PASS=""
  MICROSOFT_CLIENT_ID=""
  MICROSOFT_TENANT_ID=""
  MICROSOFT_CLIENT_SECRET=""
  GOOGLE_CLIENT_ID=""
  GOOGLE_CLIENT_SECRET=""

  echo ""
  echo -e "${GREEN}✓ Configurazione automatica completata${NC}"
  echo -e "  DB: ${BOLD}$DB_NAME${NC} / User: ${BOLD}$DB_USER${NC}"
  echo -e "  ${YELLOW}Nota: SMTP e OAuth2 possono essere configurati in seguito dalle Impostazioni${NC}"

else
  # ── MODALITÀ AVANZATA ──
  echo ""
  echo -e "${YELLOW}${BOLD}── Installazione Avanzata ──${NC}"

  echo ""
  echo -e "${BOLD}── Configurazione database ──${NC}"
  read -p "Nome database [mailhaven]: " DB_NAME
  DB_NAME=${DB_NAME:-mailhaven}
  read -p "Utente database [mailhaven]: " DB_USER
  DB_USER=${DB_USER:-mailhaven}
  read -s -p "Password database [genera casuale]: " DB_PASSWORD
  echo ""
  DB_PASSWORD=${DB_PASSWORD:-$(generate_key | cut -c1-24)}

  echo ""
  echo -e "${BOLD}── Configurazione SMTP (opzionale) ──${NC}"
  read -p "Server SMTP: " SMTP_HOST
  read -p "Porta SMTP [587]: " SMTP_PORT
  SMTP_PORT=${SMTP_PORT:-587}
  read -p "SSL/TLS (true/false) [false]: " SMTP_SECURE
  SMTP_SECURE=${SMTP_SECURE:-false}
  read -p "Utente SMTP: " SMTP_USER
  read -s -p "Password SMTP: " SMTP_PASS
  echo ""

  echo ""
  echo -e "${BOLD}── OAuth2 Microsoft (opzionale) ──${NC}"
  read -p "Microsoft Client ID: " MICROSOFT_CLIENT_ID
  read -p "Microsoft Tenant ID: " MICROSOFT_TENANT_ID
  read -s -p "Microsoft Client Secret: " MICROSOFT_CLIENT_SECRET
  echo ""

  echo ""
  echo -e "${BOLD}── OAuth2 Google (opzionale) ──${NC}"
  read -p "Google Client ID: " GOOGLE_CLIENT_ID
  read -s -p "Google Client Secret: " GOOGLE_CLIENT_SECRET
  echo ""

  echo ""
  read -p "URL base per OAuth redirect (es. https://mail.tuodominio.it): " OAUTH_REDIRECT_BASE_URL
  OAUTH_REDIRECT_BASE_URL=${OAUTH_REDIRECT_BASE_URL:-http://localhost:8080}
fi

# ── Crea .env ──
cat > "$INSTALL_DIR/.env" << EOF
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_SECURE=${SMTP_SECURE}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
MICROSOFT_CLIENT_ID=${MICROSOFT_CLIENT_ID}
MICROSOFT_TENANT_ID=${MICROSOFT_TENANT_ID}
MICROSOFT_CLIENT_SECRET=${MICROSOFT_CLIENT_SECRET}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
OAUTH_REDIRECT_BASE_URL=${OAUTH_REDIRECT_BASE_URL}
EOF

echo -e "${GREEN}✓ File .env creato${NC}"

# ── Crea cartelle necessarie ──
mkdir -p "$INSTALL_DIR/data"

# ── Crea volumi Docker ──
echo ""
echo -e "${BOLD}── Creazione volumi Docker ──${NC}"
docker volume create mailhaven_mailhaven-db-data 2>/dev/null || true
docker volume create mailhaven_mailhaven-clamav-db 2>/dev/null || true
echo -e "${GREEN}✓ Volumi creati${NC}"


# ── Cron check aggiornamenti ──
echo ""
echo -e "${BOLD}── Configurazione cron aggiornamenti ──${NC}"
CRON_JOB="*/30 * * * * bash /root/mailhaven/check-update.sh >> /root/mailhaven/data/check-update.log 2>&1"
(crontab -l 2>/dev/null | grep -v 'check-update.sh'; echo "$CRON_JOB") | crontab -
echo -e "${GREEN}✓ Cron configurato (ogni 30 minuti)${NC}"

# ── Avvia ──
echo ""
echo -e "${BOLD}── Avvio MailHaven ──${NC}"
cd "$INSTALL_DIR"
docker compose up -d --build

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   MailHaven installato con successo! 🎉  ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Accesso:${NC} http://$(hostname -I | awk '{print $1}'):8080"
echo -e "  ${BOLD}Completa il setup${NC} aprendo l'URL nel browser"
echo ""
echo -e "${YELLOW}Nota: al primo accesso verrà richiesto di creare l'utente amministratore.${NC}"
echo ""
