#!/usr/bin/env bash
# check-update.sh — confronta HEAD con origin/main (non con il tag)
# Il tag serve solo per visualizzare il numero di versione target

INSTALL_DIR="${INSTALL_DIR:-/root/mailhaven}"
OUTPUT="$INSTALL_DIR/data/git-status.json"

mkdir -p "$INSTALL_DIR/data"
cd "$INSTALL_DIR" || exit 1

# ── Fetch remoto (silenzioso, non blocca lo script se fallisce) ────────────
_fetch_ok=0
if git ls-remote --tags origin > /dev/null 2>&1; then
  git fetch --tags --quiet origin 2>/dev/null && _fetch_ok=1 || true
else
  # Prova con token GitHub da .env
  if [ -f "$INSTALL_DIR/.env" ]; then
    GITHUB_TOKEN=$(grep 'GITHUB_TOKEN' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d ' "' | head -1 || true)
    REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
    if [ -n "$GITHUB_TOKEN" ] && echo "$REMOTE_URL" | grep -q "github.com"; then
      AUTHED_URL=$(echo "$REMOTE_URL" | sed "s|https://|https://${GITHUB_TOKEN}@|")
      git fetch --tags --quiet "$AUTHED_URL" 2>/dev/null && _fetch_ok=1 || true
    fi
  fi
fi

# ── Versione corrente (HEAD) ───────────────────────────────────────────────
CURRENT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

# ── Confronto con origin/main (non col tag) ───────────────────────────────
# hasUpdate = true solo se origin/main ha commit che HEAD non ha
REMOTE_COMMIT="$(git rev-parse --short origin/main 2>/dev/null || echo unknown)"
BEHIND="$(git rev-list HEAD..origin/main --count 2>/dev/null || echo 0)"

# ── Ultimo tag (solo per mostrare il numero di versione target nella UI) ──
LATEST_TAG="$(git tag --sort=-v:refname 2>/dev/null | head -n 1 || true)"
LOG_REF="${LATEST_TAG:-origin/main}"

# ── Scrivi JSON ───────────────────────────────────────────────────────────
python3 - << PYEOF
import subprocess, json, os

install_dir = '$INSTALL_DIR'
log_ref = '$LOG_REF'
commits = []
try:
    result = subprocess.run(
        ['git', 'log', '--oneline', '-5', log_ref],
        capture_output=True, text=True, cwd=install_dir
    )
    for line in result.stdout.strip().split('\n'):
        if not line.strip():
            continue
        parts = line.split(' ', 1)
        commits.append({'hash': parts[0], 'message': parts[1] if len(parts) > 1 else ''})
except Exception:
    pass

behind_raw = '$BEHIND'
data = {
    'currentCommit':  '$CURRENT',
    'remoteCommit':   '$REMOTE_COMMIT',
    'latestTag':      '$LATEST_TAG',
    'commitsBehind':  int(behind_raw) if behind_raw.isdigit() else 0,
    'latestCommits':  commits,
    'fetchOk':        bool(int('$_fetch_ok')),
}
with open('$OUTPUT', 'w', encoding='utf-8') as f:
    json.dump(data, f)
PYEOF

echo "[check-update] current=$CURRENT remote=$REMOTE_COMMIT tag=$LATEST_TAG behind=$BEHIND fetch_ok=$_fetch_ok"
