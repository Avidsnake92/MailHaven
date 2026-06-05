#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/root/mailhaven}"
OUTPUT="$INSTALL_DIR/data/git-status.json"

mkdir -p "$INSTALL_DIR/data"
cd "$INSTALL_DIR" || exit 1

# Fetch con token se disponibile nel remote URL, altrimenti prova senza auth
if git ls-remote --tags origin > /dev/null 2>&1; then
  git fetch --tags origin --quiet 2>/dev/null || true
else
  # Prova a configurare remote con token da .env
  if [ -f "$INSTALL_DIR/.env" ]; then
    GITHUB_TOKEN=$(grep GITHUB_TOKEN "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d ' ')
    REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
    if [ -n "$GITHUB_TOKEN" ] && echo "$REMOTE_URL" | grep -q "github.com"; then
      AUTHED_URL=$(echo "$REMOTE_URL" | sed "s|https://|https://${GITHUB_TOKEN}@|")
      git fetch --tags "$AUTHED_URL" --quiet 2>/dev/null || true
    fi
  fi
fi

CURRENT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
LATEST_TAG="$(git tag --sort=-v:refname | head -n 1 2>/dev/null || true)"

if [ -n "$LATEST_TAG" ]; then
  REMOTE="$(git rev-parse --short "$LATEST_TAG" 2>/dev/null || echo unknown)"
  BEHIND="$(git rev-list HEAD.."$LATEST_TAG" --count 2>/dev/null || echo 0)"
  LOG_REF="$LATEST_TAG"
else
  REMOTE="$(git rev-parse --short origin/main 2>/dev/null || echo unknown)"
  BEHIND="$(git rev-list HEAD..origin/main --count 2>/dev/null || echo 0)"
  LOG_REF="origin/main"
fi

python3 - << PYEOF
import subprocess, json

install_dir = '$INSTALL_DIR'
log_ref = '$LOG_REF'
commits = []
try:
    result = subprocess.run(
        ['git', 'log', '--oneline', '-5', log_ref],
        capture_output=True, text=True, cwd=install_dir
    )
    for line in result.stdout.strip().split('\\n'):
        if not line.strip():
            continue
        parts = line.split(' ', 1)
        commits.append({'hash': parts[0], 'message': parts[1] if len(parts) > 1 else ''})
except Exception:
    pass

data = {
    'currentCommit': '$CURRENT',
    'remoteCommit': '$REMOTE',
    'latestTag': '$LATEST_TAG',
    'commitsBehind': int('$BEHIND') if '$BEHIND'.isdigit() else 0,
    'latestCommits': commits,
}
with open('$OUTPUT', 'w', encoding='utf-8') as f:
    json.dump(data, f)
PYEOF

echo "[check-update] current=$CURRENT remote=$REMOTE tag=$LATEST_TAG behind=$BEHIND"
