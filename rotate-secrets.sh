#!/bin/bash
# Ruota JWT_SECRET e DB_PASSWORD in .env e applica la nuova password al ruolo Postgres.
# Da lanciare nella cartella del progetto (dove si trova .env e docker-compose.yml).
#
# Uso:
#   bash rotate-secrets.sh            # ruota sia JWT_SECRET che DB_PASSWORD
#   bash rotate-secrets.sh jwt        # ruota solo JWT_SECRET
#   bash rotate-secrets.sh db         # ruota solo DB_PASSWORD
#
# Effetti:
#  - JWT_SECRET: tutte le sessioni utente attive vengono invalidate (serve rifare login)
#  - DB_PASSWORD: il container backend e db vengono ricreati

set -e

WHAT="${1:-all}"

if [ ! -f .env ]; then
  echo "ERRORE: .env non trovato. Esegui questo script dalla cartella del progetto (es. /root/mailhaven)."
  exit 1
fi

ROTATE_JWT=false
ROTATE_DB=false
case "$WHAT" in
  all) ROTATE_JWT=true; ROTATE_DB=true ;;
  jwt) ROTATE_JWT=true ;;
  db)  ROTATE_DB=true ;;
  *) echo "Argomento non valido: $WHAT (usa: all | jwt | db)"; exit 1 ;;
esac

cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"

if [ "$ROTATE_JWT" = true ]; then
  NEW_JWT=$(openssl rand -hex 32)
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${NEW_JWT}/" .env
  echo "JWT_SECRET ruotato."
fi

if [ "$ROTATE_DB" = true ]; then
  NEW_DB_PASS=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 32)
  DB_USER=$(grep '^DB_USER=' .env | cut -d= -f2)
  OLD_DB_PASS=$(grep '^DB_PASSWORD=' .env | cut -d= -f2)

  sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=${NEW_DB_PASS}/" .env

  # Applica la nuova password al ruolo Postgres usando le credenziali correnti (vecchie)
  PGPASSWORD="$OLD_DB_PASS" docker exec -e PGPASSWORD="$OLD_DB_PASS" mailhaven-db \
    psql -U "$DB_USER" -d postgres -c "ALTER ROLE \"${DB_USER}\" WITH PASSWORD '${NEW_DB_PASS}';"

  echo "DB_PASSWORD ruotato e applicato al ruolo Postgres."
fi

echo "Riavvio backend (e db se la password e' cambiata)..."
if [ "$ROTATE_DB" = true ]; then
  docker compose up -d --force-recreate mailhaven-db mailhaven-backend
else
  docker compose up -d --force-recreate mailhaven-backend
fi

echo "Attendo che il backend sia pronto..."
for i in $(seq 1 24); do
  if curl -sf http://localhost:3001/api/health >/dev/null 2>&1; then
    echo "Backend OK."
    exit 0
  fi
  sleep 5
done

echo "ATTENZIONE: il backend non risponde dopo 2 minuti. Controlla 'docker logs mailhaven-backend'."
exit 1
