#!/usr/bin/env bash
set -Eeuo pipefail

VERSION="${1:-}"
[ -n "$VERSION" ] || { echo "Uso: bash release.sh 0.0.86"; exit 1; }

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Versione non valida: usa formato SemVer, esempio 0.0.86" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree non pulito. Committa o annulla le modifiche prima della release." >&2
  exit 1
fi

BUILD="$(date '+%Y%m%d')"
python3 - << PYEOF
import json
path = 'version.json'
with open(path, encoding='utf-8') as f:
    data = json.load(f)
data['version'] = '$VERSION'
data['build'] = '$BUILD'
with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)
    f.write('\\n')
PYEOF

if ! grep -q "## [$VERSION]" CHANGELOG.md; then
  tmp="$(mktemp)"
  {
    echo "# Changelog"
    echo
    echo "## [$VERSION] - $(date '+%Y-%m-%d')"
    echo "### Changed"
    echo "- Preparazione release $VERSION."
    echo
    tail -n +2 CHANGELOG.md
  } > "$tmp"
  mv "$tmp" CHANGELOG.md
fi

git add version.json CHANGELOG.md
git commit -m "chore: release v$VERSION"
git tag -a "v$VERSION" -m "MailHaven v$VERSION"

echo "Release v$VERSION pronta."
echo "Esegui: git push origin main --tags"
