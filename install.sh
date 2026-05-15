#!/bin/bash
# MailHaven — Installer
# Uso: bash install.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

INSTALL_DIR="/root/mailhaven"

clear

echo ""
echo -e "${BLUE}${BOLD}"
echo "  ╔╦╗╔═╗╦╦  ╦ ╦╔═╗╦  ╦╔═╗╔╗╔"
echo "  ║║║╠═╣║║  ╠═╣╠═╣╚╗╔╝║╣ ║║║"
echo "  ╩ ╩╩ ╩╩╩═╝╩ ╩╩ ╩ ╚╝ ╚═╝╝╚╝"
echo -e "${NC}"
echo -e "  ${DIM}Archiviazione email professionale — Installer v1.0${NC}"
echo ""
echo -e "  ${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Funzioni ──
generate_key() {
  openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1
}

step() {
  echo ""
  echo -e "  ${BLUE}${BOLD}┌─ $1${NC}"
}

ok() {
  echo -e "  ${GREEN}│  ✓ $1${NC}"
}

info() {
  echo -e "  ${BLUE}│  ${DIM}$1${NC}"
}

warn() {
  echo -e "  ${YELLOW}│  ⚠ $1${NC}"
}

err() {
  echo -e "  ${RED}│  ✗ $1${NC}"
}

ask() {
  echo -ne "  ${BLUE}│${NC}  $1 "
}

done_step() {
  echo -e "  ${BLUE}└─${GREEN} OK${NC}"
  echo ""
}

# ── Step 1: Prerequisiti ──
step "Verifica prerequisiti"

if ! command -v git &> /dev/null; then
  warn "git non trovato, installazione..."
  apt-get install -y git -qq && ok "git installato" || { err "Impossibile installare git"; exit 1; }
else
  ok "git $(git --version | cut -d' ' -f3)"
fi

if ! command -v curl &> /dev/null; then
  warn "curl non trovato, installazione..."
  apt-get install -y curl -qq && ok "curl installato" || { err "Impossibile installare curl"; exit 1; }
else
  ok "curl $(curl --version | head -1 | cut -d' ' -f2)"
fi

if ! command -v docker &> /dev/null; then
  warn "Docker non trovato. Installazione in corso..."
  curl -fsSL https://get.docker.com | sh -s -- -q
  systemctl enable docker -q
  systemctl start docker
  sleep 3
  # Assicura che docker sia nel PATH nella sessione corrente
  export PATH=$PATH:/usr/bin:/usr/local/bin
  hash -r
  if ! command -v docker &> /dev/null; then
    err "Docker installato ma non nel PATH. Riavvia la sessione e rilancia install.sh"
    exit 1
  fi
  ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
else
  ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
fi

if ! docker compose version &> /dev/null; then
  err "Docker Compose non trovato. Installa Docker Compose v2 e riprova."
  exit 1
else
  ok "Docker Compose $(docker compose version --short 2>/dev/null || echo 'v2')"
fi

if ! command -v openssl &> /dev/null; then
  apt-get install -y openssl -qq
fi
ok "openssl disponibile"

done_step

# ── Step 2: GitHub Token ──
step "Configurazione repository"

# Controlla se il token è già salvato nel .env
SAVED_TOKEN=""
if [ -f "$INSTALL_DIR/.env" ]; then
  SAVED_TOKEN=$(grep "^GITHUB_TOKEN=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d'=' -f2)
fi

if [ -n "$SAVED_TOKEN" ]; then
  info "Token GitHub già salvato"
  ask "Vuoi usare il token salvato? [S/n]:"
  read USE_SAVED
  USE_SAVED=${USE_SAVED:-S}
  if [[ "$USE_SAVED" =~ ^[Ss]$ ]]; then
    GITHUB_TOKEN="$SAVED_TOKEN"
    ok "Token esistente confermato"
  else
    ask "Inserisci il nuovo GitHub Personal Access Token:"
    read -s GITHUB_TOKEN
    echo ""
    ok "Nuovo token acquisito"
  fi
else
  info "Il token verrà salvato nel .env per i futuri aggiornamenti"
  ask "GitHub Personal Access Token:"
  read -s GITHUB_TOKEN
  echo ""
  ok "Token acquisito"
fi

REPO_URL="https://${GITHUB_TOKEN}@github.com/Avidsnake92/MailHaven.git"

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Repository già presente — aggiorno..."
  cd "$INSTALL_DIR"
  git remote set-url origin "$REPO_URL" 2>/dev/null
  git fetch origin main -q
  git reset --hard origin/main -q
  ok "Repository aggiornato"
else
  info "Clonazione repository..."
  git clone -q "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  ok "Repository clonato in $INSTALL_DIR"
fi

VERSION=$(cat "$INSTALL_DIR/version.json" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','?'))" 2>/dev/null || echo "?")
ok "Versione MailHaven: $VERSION"

done_step

# ── Step 3: Modalità installazione ──
step "Modalità installazione"
echo -e "  ${BLUE}│${NC}"
echo -e "  ${BLUE}│${NC}  ${BOLD}  1)${NC} ${GREEN}Base${NC}     — configurazione automatica ${DIM}(consigliata)${NC}"
echo -e "  ${BLUE}│${NC}  ${BOLD}  2)${NC} ${YELLOW}Avanzata${NC} — configura manualmente DB, SMTP, OAuth2"
echo -e "  ${BLUE}│${NC}"
ask "Scegli [1]:"
read INSTALL_MODE
INSTALL_MODE=${INSTALL_MODE:-1}

JWT_SECRET=$(generate_key)
ENCRYPTION_KEY=$(generate_key)

if [ "$INSTALL_MODE" = "1" ]; then
  echo -e "  ${BLUE}│${NC}  ${GREEN}→ Modalità Base selezionata${NC}"
  DB_NAME="mailhaven"
  DB_USER="mailhaven"
  DB_PASSWORD=$(generate_key | cut -c1-24)
  LOCAL_IP=$(hostname -I | awk '{print $1}')
  ask "URL di accesso [http://${LOCAL_IP}:8080]:"
  read OAUTH_REDIRECT_BASE_URL
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
  ok "Configurazione automatica completata"
  warn "SMTP e OAuth2 configurabili in seguito dalle Impostazioni"
else
  echo -e "  ${BLUE}│${NC}  ${YELLOW}→ Modalità Avanzata selezionata${NC}"
  echo -e "  ${BLUE}│${NC}"

  echo -e "  ${BLUE}│  ${BOLD}Database:${NC}"
  ask "  Nome database [mailhaven]:"
  read DB_NAME; DB_NAME=${DB_NAME:-mailhaven}
  ask "  Utente database [mailhaven]:"
  read DB_USER; DB_USER=${DB_USER:-mailhaven}
  ask "  Password database [genera casuale]:"
  read -s DB_PASSWORD; echo ""
  DB_PASSWORD=${DB_PASSWORD:-$(generate_key | cut -c1-24)}

  echo -e "  ${BLUE}│${NC}"
  echo -e "  ${BLUE}│  ${BOLD}SMTP ${DIM}(opzionale):${NC}"
  ask "  Server SMTP:"
  read SMTP_HOST
  ask "  Porta SMTP [587]:"
  read SMTP_PORT; SMTP_PORT=${SMTP_PORT:-587}
  ask "  SSL/TLS (true/false) [false]:"
  read SMTP_SECURE; SMTP_SECURE=${SMTP_SECURE:-false}
  ask "  Utente SMTP:"
  read SMTP_USER
  ask "  Password SMTP:"
  read -s SMTP_PASS; echo ""

  echo -e "  ${BLUE}│${NC}"
  echo -e "  ${BLUE}│  ${BOLD}OAuth2 Microsoft ${DIM}(opzionale):${NC}"
  ask "  Client ID:"
  read MICROSOFT_CLIENT_ID
  ask "  Tenant ID:"
  read MICROSOFT_TENANT_ID
  ask "  Client Secret:"
  read -s MICROSOFT_CLIENT_SECRET; echo ""

  echo -e "  ${BLUE}│${NC}"
  echo -e "  ${BLUE}│  ${BOLD}OAuth2 Google ${DIM}(opzionale):${NC}"
  ask "  Client ID:"
  read GOOGLE_CLIENT_ID
  ask "  Client Secret:"
  read -s GOOGLE_CLIENT_SECRET; echo ""

  echo -e "  ${BLUE}│${NC}"
  LOCAL_IP=$(hostname -I | awk '{print $1}')
  ask "URL base OAuth redirect [http://${LOCAL_IP}:8080]:"
  read OAUTH_REDIRECT_BASE_URL
  OAUTH_REDIRECT_BASE_URL=${OAUTH_REDIRECT_BASE_URL:-http://${LOCAL_IP}:8080}
fi

done_step

# ── Step 4: File .env ──
step "Creazione configurazione"

cat > "$INSTALL_DIR/.env" << ENVEOF
GITHUB_TOKEN=${GITHUB_TOKEN}
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
ENVEOF

ok "File .env creato"

mkdir -p "$INSTALL_DIR/data"
ok "Directory data creata"

# Inizializza git-status.json
if [ ! -f "$INSTALL_DIR/data/git-status.json" ] || [ -d "$INSTALL_DIR/data/git-status.json" ]; then
  rm -rf "$INSTALL_DIR/data/git-status.json"
  echo '{"currentCommit":"unknown","remoteCommit":"unknown","commitsBehind":0,"latestCommits":[]}' > "$INSTALL_DIR/data/git-status.json"
fi
ok "git-status.json inizializzato"

done_step

# ── Step 5: Volumi Docker ──
step "Preparazione Docker"

docker volume create mailhaven_mailhaven-db-data 2>/dev/null && ok "Volume DB creato" || ok "Volume DB già esistente"
docker volume create mailhaven_mailhaven-clamav-db 2>/dev/null && ok "Volume ClamAV creato" || ok "Volume ClamAV già esistente"

done_step

# ── Step 6: Cron ──
step "Configurazione cron"

CRON_CHECK="*/30 * * * * bash /root/mailhaven/check-update.sh >> /root/mailhaven/data/check-update.log 2>&1"
CRON_TRIGGER="* * * * * if [ -f /root/mailhaven/data/update.trigger ]; then rm -f /root/mailhaven/data/update.trigger && bash /root/mailhaven/do-update.sh > /root/mailhaven/data/update.log 2>&1; fi"

(crontab -l 2>/dev/null | grep -v 'check-update.sh' | grep -v 'update.trigger'; echo "$CRON_CHECK"; echo "$CRON_TRIGGER") | crontab -

ok "Cron check aggiornamenti (ogni 30 min)"
ok "Cron trigger aggiornamento GUI (ogni min)"

done_step

# ── Step 7: Avvio ──
step "Avvio MailHaven"

cd "$INSTALL_DIR"
info "Build e avvio container in corso (potrebbe richiedere qualche minuto)..."
echo ""
docker compose up -d --build
echo ""

# Verifica che i container siano partiti
sleep 5
RUNNING=$(docker compose ps --status running 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')
RUNNING=${RUNNING:-0}
if [ "$RUNNING" -ge 3 ]; then
  ok "Container avviati ($RUNNING/3)"
else
  warn "Alcuni container potrebbero non essere partiti — verifica con: docker compose ps"
fi

# Aggiorna git-status
bash "$INSTALL_DIR/check-update.sh" 2>/dev/null
ok "Stato aggiornamenti verificato"

done_step

# ── Riepilogo finale ──
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "  ${GREEN}${BOLD}┌─────────────────────────────────────────────────────────┐${NC}"
echo -e "  ${GREEN}${BOLD}│          MailHaven installato con successo! 🎉           │${NC}"
echo -e "  ${GREEN}${BOLD}└─────────────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${BOLD}Accesso:${NC}       ${CYAN}${OAUTH_REDIRECT_BASE_URL}${NC}"
echo -e "  ${BOLD}Versione:${NC}      ${GREEN}${VERSION}${NC}"
echo ""
echo -e "  ${BOLD}Database:${NC}"
echo -e "    Nome:        ${BOLD}${DB_NAME}${NC}"
echo -e "    Utente:      ${BOLD}${DB_USER}${NC}"
echo -e "    Password:    ${BOLD}${DB_PASSWORD}${NC}  ${DIM}← salvare in luogo sicuro!${NC}"
echo ""
echo -e "  ${BOLD}Cron attivi:${NC}"
echo -e "    ${DIM}• Check aggiornamenti ogni 30 minuti${NC}"
echo -e "    ${DIM}• Trigger aggiornamento GUI ogni minuto${NC}"
echo ""
echo -e "  ${YELLOW}Al primo accesso verrà richiesto di creare l'utente amministratore.${NC}"
echo ""
echo -e "  ${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
