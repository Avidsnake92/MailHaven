#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/root/mailhaven}"
REPO_URL="${REPO_URL:-https://github.com/Avidsnake92/MailHaven.git}"
RELEASE_REF="${RELEASE_REF:-}"

log() { printf '[install] %s\n' "$*"; }
die() { printf '[install] ERRORE: %s\n' "$*" >&2; exit 1; }
need_root() { [ "$(id -u)" -eq 0 ] || die "esegui come root"; }
gen_hex() { openssl rand -hex 32; }

install_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl git openssl cron

  if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
  fi

  systemctl enable --now docker
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 non disponibile"
}

checkout_code() {
  if [ -d "$INSTALL_DIR/.git" ]; then
    log "repository gia presente, aggiorno fetch"
    git -C "$INSTALL_DIR" fetch --tags origin
  else
    log "clono repository in $INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
    git -C "$INSTALL_DIR" fetch --tags origin
  fi

  if [ -z "$RELEASE_REF" ]; then
    RELEASE_REF="$(git -C "$INSTALL_DIR" tag --sort=-v:refname | head -n 1 || true)"
  fi
  [ -n "$RELEASE_REF" ] || RELEASE_REF="origin/main"

  log "checkout $RELEASE_REF"
  git -C "$INSTALL_DIR" checkout --force "$RELEASE_REF"
}

write_env() {
  cd "$INSTALL_DIR"
  if [ -f .env ]; then
    log ".env gia presente, non lo sovrascrivo"
    return
  fi

  local ip app_url
  ip="$(hostname -I | awk '{print $1}')"
  read -r -p "URL pubblico MailHaven [http://${ip}:8080]: " app_url
  app_url="${app_url:-http://${ip}:8080}"

  cat > .env <<ENV
NODE_ENV=production
PORT=3001
APP_URL=${app_url}
OAUTH_REDIRECT_BASE_URL=${app_url}
ADDITIONAL_ORIGINS=

JWT_SECRET=$(gen_hex)
ENCRYPTION_KEY=$(gen_hex)

DB_HOST=mailhaven-db
DB_PORT=5432
DB_NAME=mailhaven
DB_USER=mailhaven
DB_PASSWORD=$(gen_hex)

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=

MICROSOFT_CLIENT_ID=
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ENV
  chmod 600 .env
  log ".env creato con segreti nuovi"
}

start_stack() {
  cd "$INSTALL_DIR"
  mkdir -p data
  docker compose build --pull
  docker compose up -d
  bash "$INSTALL_DIR/check-update.sh" || true
}

install_cron() {
  local check trigger
  check="*/30 * * * * bash $INSTALL_DIR/check-update.sh >> $INSTALL_DIR/data/check-update.log 2>&1"
  trigger="* * * * * if [ -f $INSTALL_DIR/data/update.trigger ]; then rm -f $INSTALL_DIR/data/update.trigger && bash $INSTALL_DIR/do-update.sh >> $INSTALL_DIR/data/update.log 2>&1; fi"
  (crontab -l 2>/dev/null | grep -v 'mailhaven/check-update.sh' | grep -v 'mailhaven/data/update.trigger' || true; echo "$check"; echo "$trigger") | crontab -
}

need_root
install_packages
checkout_code
write_env
start_stack
install_cron

log "installazione completata"
log "apri MailHaven su: $(grep '^APP_URL=' "$INSTALL_DIR/.env" | cut -d= -f2-)"
log "se usi HTTPS/reverse proxy, aggiorna APP_URL e OAUTH_REDIRECT_BASE_URL in $INSTALL_DIR/.env"
