#!/bin/bash
# MailHaven — Check aggiornamenti disponibili

INSTALL_DIR="/root/mailhaven"
OUTPUT="$INSTALL_DIR/data/git-status.json"

mkdir -p "$INSTALL_DIR/data"
cd "$INSTALL_DIR" || exit 1

git fetch origin main --quiet 2>/dev/null

CURRENT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
REMOTE=$(git rev-parse --short origin/main 2>/dev/null || echo "unknown")
BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo "0")

# Genera JSON sicuro per i commit usando python3 — evita problemi con caratteri speciali
python3 - << PYEOF
import subprocess, json, os

try:
    result = subprocess.run(
        ['git', 'log', '--oneline', '-5', 'origin/main'],
        capture_output=True, text=True, cwd='$INSTALL_DIR'
    )
    commits = []
    for line in result.stdout.strip().split('\n'):
        if not line.strip():
            continue
        parts = line.split(' ', 1)
        commits.append({
            'hash': parts[0],
            'message': parts[1] if len(parts) > 1 else ''
        })
except Exception:
    commits = []

data = {
    'currentCommit': '$CURRENT',
    'remoteCommit': '$REMOTE',
    'commitsBehind': int('$BEHIND') if '$BEHIND'.isdigit() else 0,
    'latestCommits': commits,
}
with open('$OUTPUT', 'w') as f:
    json.dump(data, f)
PYEOF

echo "[check-update] current=$CURRENT remote=$REMOTE behind=$BEHIND"
