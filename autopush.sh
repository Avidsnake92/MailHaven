#!/bin/bash
cd /root/mailvault

# Controlla se ci sono modifiche
if git diff --quiet && git diff --cached --quiet && [ -z "$(git status --porcelain)" ]; then
  echo "$(date '+%Y-%m-%d %H:%M') - Nessuna modifica, push saltato."
  exit 0
fi

# Leggi il numero attuale e incrementa
VERSION_FILE="/root/mailvault/.push_version"
if [ -f "$VERSION_FILE" ]; then
  VERSION=$(cat "$VERSION_FILE")
  VERSION=$((VERSION + 1))
else
  VERSION=1
fi
echo $VERSION > "$VERSION_FILE"

# Commit e push
git add .
git commit -m "Aggiornamento-$VERSION ($(date '+%Y-%m-%d %H:%M'))"
git push

echo "$(date '+%Y-%m-%d %H:%M') - Push completato: Aggiornamento-$VERSION"
