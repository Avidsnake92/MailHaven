#!/usr/bin/env bash
# ============================================================================
# fix-update.sh — Ripara e forza l'aggiornamento di MailHaven in PRODUZIONE
#
# Cosa fa:
#   1) Allinea il repository all'ultima versione (gestisce working tree sporco,
#      token GitHub, branch/HEAD sbagliato) — SENZA mai toccare il database.
#   2) Ricostruisce backend + frontend (riusa do-update.sh, gia' testato).
#   3) Installa/ripara il CRON-WATCHER che mancava: e' lui che fa funzionare il
#      pulsante "Aggiorna" dentro l'app (il backend gira in container e non puo'
#      aggiornare se stesso: scrive solo un file-trigger, serve un aiutante host).
#
# E' idempotente: puoi rilanciarlo quante volte vuoi.
# Eseguire come root:   bash fix-update.sh
# ============================================================================
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/root/mailhaven}"
BRANCH="${BRANCH:-main}"

say()  { echo -e "\033[1;36m[fix-update]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ ok ]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn]\033[0m $*"; }
die()  { echo -e "\033[1;31m[ERRORE]\033[0m $*" >&2; exit 1; }

[ -d "$INSTALL_DIR/.git" ] || die "Non trovo il repo git in $INSTALL_DIR (imposta INSTALL_DIR se diverso)."
cd "$INSTALL_DIR"

say "Directory:        $INSTALL_DIR"
say "Versione attuale: $(cat version.json 2>/dev/null | grep -o '\"version\"[^,]*' || echo '?')  (commit $(git rev-parse --short HEAD 2>/dev/null || echo '?'))"

# ── 1. Assicura l'autenticazione GitHub sul remote ─────────────────────────
# Se 'git fetch' non passa, prova a iniettare il token da .env nell'URL remoto.
say "Verifico accesso a GitHub..."
if ! git fetch --tags --quiet origin 2>/dev/null; then
  warn "fetch fallito: provo con il token GitHub da .env"
  if [ -f "$INSTALL_DIR/.env" ]; then
    TOKEN=$(grep -E '^GITHUB_TOKEN=' "$INSTALL_DIR/.env" | head -1 | cut -d= -f2- | tr -d ' "' || true)
    REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
    if [ -n "${TOKEN:-}" ] && echo "$REMOTE_URL" | grep -q 'github.com'; then
      # Rimuove eventuale vecchia credenziale e reinserisce il token
      CLEAN_URL=$(echo "$REMOTE_URL" | sed -E 's#https://[^@]*@#https://#')
      AUTHED_URL=$(echo "$CLEAN_URL" | sed "s#https://#https://${TOKEN}@#")
      git remote set-url origin "$AUTHED_URL"
      git fetch --tags --quiet origin || die "Accesso a GitHub ancora KO: il token in .env e' scaduto/errato. Rigeneralo su GitHub e aggiorna GITHUB_TOKEN nel file .env."
      ok "Token GitHub applicato al remote (persistente)."
    else
      die "fetch fallito e nessun GITHUB_TOKEN utilizzabile in .env. Aggiungi GITHUB_TOKEN=ghp_... in $INSTALL_DIR/.env e rilancia."
    fi
  else
    die "fetch fallito e manca $INSTALL_DIR/.env. Servono le credenziali GitHub."
  fi
fi
ok "GitHub raggiungibile."

# ── 2. Metti da parte eventuali modifiche locali (NON le perdo) ────────────
if [ -n "$(git status --porcelain)" ]; then
  STAMP=$(date +%Y%m%d-%H%M%S)
  BK="$INSTALL_DIR/data/local-changes-$STAMP.patch"
  mkdir -p "$INSTALL_DIR/data"
  warn "Working tree sporco: salvo le modifiche locali in $BK prima di allineare."
  git diff > "$BK" 2>/dev/null || true
  git stash push -u -m "fix-update $STAMP" >/dev/null 2>&1 || true
  ok "Modifiche locali messe da parte (patch: $BK, e in git stash)."
fi

# ── 3. Allinea forzatamente all'ultima versione di origin/<branch> ─────────
say "Allineo il repo a origin/$BRANCH ..."
git checkout "$BRANCH" --quiet 2>/dev/null || git checkout -B "$BRANCH" "origin/$BRANCH" --quiet
git reset --hard "origin/$BRANCH" --quiet
TARGET_TAG=$(git tag --sort=-v:refname 2>/dev/null | head -1 || true)
ok "Repo allineato: commit $(git rev-parse --short HEAD)  (tag piu' recente: ${TARGET_TAG:-n/d})"

# ── 4. Permessi script ─────────────────────────────────────────────────────
chmod +x "$INSTALL_DIR"/*.sh 2>/dev/null || true

# ── 5. Installa/ripara il CRON-WATCHER del trigger ─────────────────────────
# Ogni minuto: se l'app ha scritto data/update.trigger, lo "consuma" (sposta) e
# lancia do-update.sh UNA volta. Cosi' il pulsante nell'app torna funzionante.
say "Installo/riparo il cron-watcher del trigger di aggiornamento..."
WATCHER="$INSTALL_DIR/update-watcher.sh"
cat > "$WATCHER" <<'WEOF'
#!/usr/bin/env bash
# Consuma data/update.trigger e lancia un singolo update. Installato da fix-update.sh.
set -euo pipefail
DIR="${INSTALL_DIR:-/root/mailhaven}"
T="$DIR/data/update.trigger"
[ -f "$T" ] || exit 0
mv "$T" "$T.running" 2>/dev/null || exit 0     # consuma il trigger (evita doppi run)
bash "$DIR/do-update.sh" >> "$DIR/data/update-cron.log" 2>&1 || true
rm -f "$T.running" 2>/dev/null || true
WEOF
chmod +x "$WATCHER"

CRON_LINE="* * * * * INSTALL_DIR=$INSTALL_DIR $WATCHER"
# Rimuove vecchie righe relative a MailHaven e reinserisce quella corretta
( crontab -l 2>/dev/null | grep -v -F "$WATCHER" | grep -v 'mailhaven.*update' ; echo "$CRON_LINE" ) | crontab -
ok "Cron-watcher installato: $(crontab -l | grep -F "$WATCHER")"

# ── 6. Esegue subito l'aggiornamento (rebuild backend + frontend) ──────────
say "Avvio aggiornamento immediato (rebuild dei container, il DB NON viene toccato)..."
echo "--------------------------------------------------------------------------"
bash "$INSTALL_DIR/do-update.sh"
echo "--------------------------------------------------------------------------"

NEWV=$(cat version.json 2>/dev/null | grep -o '\"version\"[^,]*' || echo '?')
ok "FATTO. Versione ora: $NEWV"
say "Da adesso il pulsante 'Aggiorna' nell'app funziona da solo (cron-watcher attivo)."
say "Log utili:  data/update.log  e  data/update-cron.log"
