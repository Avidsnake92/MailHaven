#!/bin/bash
# MailHaven — Installer
# Uso: bash install.sh

set -e

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
  echo -e "${GREEN}Docker installato!${NC}"
else
  echo -e "${GREEN}✓ Docker trovato: $(docker --version)${NC}"
fi

if ! docker compose version &> /dev/null; then
  echo -e "${RED}Docker Compose non trovato. Installa Docker Desktop o docker-compose-plugin.${NC}"
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

# ── Configurazione interattiva ──
echo ""
echo -e "${BOLD}── Configurazione database ──${NC}"
read -p "Nome database [mailvault]: " DB_NAME
DB_NAME=${DB_NAME:-mailvault}
read -p "Utente database [mailvault]: " DB_USER
DB_USER=${DB_USER:-mailvault}
read -s -p "Password database [genera casuale]: " DB_PASSWORD
echo ""
DB_PASSWORD=${DB_PASSWORD:-$(generate_key | cut -c1-24)}

echo ""
echo -e "${BOLD}── Configurazione SMTP (opzionale, premi invio per saltare) ──${NC}"
read -p "Server SMTP: " SMTP_HOST
read -p "Porta SMTP [587]: " SMTP_PORT
SMTP_PORT=${SMTP_PORT:-587}
read -p "SSL/TLS (true/false) [false]: " SMTP_SECURE
SMTP_SECURE=${SMTP_SECURE:-false}
read -p "Utente SMTP: " SMTP_USER
read -s -p "Password SMTP: " SMTP_PASS
echo ""

echo ""
echo -e "${BOLD}── OAuth2 (opzionale, premi invio per saltare) ──${NC}"
echo -e "${YELLOW}Puoi configurare OAuth2 in seguito dalle Impostazioni.${NC}"
read -p "Microsoft Client ID: " MICROSOFT_CLIENT_ID
read -p "Microsoft Tenant ID: " MICROSOFT_TENANT_ID
read -s -p "Microsoft Client Secret: " MICROSOFT_CLIENT_SECRET
echo ""
read -p "Google Client ID: " GOOGLE_CLIENT_ID
read -s -p "Google Client Secret: " GOOGLE_CLIENT_SECRET
echo ""

echo ""
read -p "URL base per OAuth redirect (es. https://mail.tuodominio.it): " OAUTH_REDIRECT_BASE_URL
OAUTH_REDIRECT_BASE_URL=${OAUTH_REDIRECT_BASE_URL:-http://localhost:8080}

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
