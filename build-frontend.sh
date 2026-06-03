#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/root/mailhaven}"
cd "$INSTALL_DIR"

echo "=== MailHaven frontend rebuild ==="
docker compose build mailhaven-frontend
docker compose up -d mailhaven-frontend
echo "Frontend aggiornato."
