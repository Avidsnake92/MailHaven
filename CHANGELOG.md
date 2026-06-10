# Changelog

## [0.1.29] - 2026-06-10
### Security
- **Rate limiting su `/api/plugin/login`**: applicato l'`authLimiter` (20 tentativi/15min)
  anche al login del plugin Outlook, per bloccare il brute force sulle credenziali
- **Rate limit per utenti autenticati**: aggiunto un limite generoso (3000 richieste/15min,
  per utente e non per IP) come rete di sicurezza contro account compromessi o script
  impazziti, senza introdurre attriti nell'uso normale
- **OAuth state firmato**: lo state dei flussi OAuth Microsoft e Google e' ora firmato
  con HMAC-SHA256 (chiave JWT_SECRET), verificato con confronto a tempo costante e
  scaduto dopo 10 minuti — previene forging/CSRF sul callback OAuth
- **CSP irrigidita**: rimosso `'unsafe-eval'` da `script-src` (non necessario nella
  build statica di produzione)
- **Script `rotate-secrets.sh`**: nuovo script per ruotare `JWT_SECRET` e `DB_PASSWORD`
  (con backup di `.env`, `ALTER ROLE` su Postgres e riavvio coordinato dei container)

### Fixed
- **`backend/src/routes/import.js`**: rimosso BOM UTF-8 e ripulita una riga di commento
  con encoding corrotto
- **Typo `.env`**: corretto `VIROSTOTAL_API_KEY` → `VIRUSTOTAL_API_KEY` (la chiave
  VirusTotal era ignorata e la scansione antivirus esterna risultava disattivata)

## [0.1.28] - 2026-06-09
### Added
- **Installer Outlook EXE**: `plugins/outlook/MailHaven-Outlook-Setup.exe` — wizard
  grafico per installare il plugin Outlook Classic senza privilegi admin, registra
  il manifest via chiave registro HKCU, supporta URL server personalizzato e
  disinstallazione dal Pannello di Controllo
- **Pagina manutenzione durante aggiornamento**: durante il restart del backend
  l'utente vede una pagina branded "Aggiornamento in corso" con spinner e
  riconnessione automatica ogni 5 secondi invece della 502 del browser
- **do-update.sh sequenziale**: backup DB in background (non bloccante),
  rebuild backend → attesa healthy → rebuild frontend

### Fixed
- **Eliminazione casella di posta asincrona**: il delete ora risponde 202 subito
  e cancella in background; la UI mostra "Eliminazione in corso..." animato
  con polling ogni 2 secondi fino alla scomparsa dalla lista
- **Rate limiting**: gli utenti autenticati (JWT valido) non hanno più limiti
  sulle chiamate API; l'authLimiter (20 req/15min) si applica solo a
  `/auth/login` e `/auth/2fa/verify-sso` per bloccare brute force
- **check-update.sh**: confronta ora con `origin/main` invece del commit del tag,
  eliminando i falsi positivi "aggiornamenti disponibili" dopo hotfix post-release
- **Verifica aggiornamenti 502**: retry automatico dopo 3s su 502/503 con
  messaggi human-friendly (backend in restart, permessi, offline)
- **Dockerfile CMD**: corretta sintassi CMD con path tra virgolette
- **Manifest Outlook Version**: formato 4-part `1.0.0.1` richiesto da Office

## [0.1.26] - 2026-06-09
### Added
- **Legal Hold**: protezione email da eliminazione per conservazione legale
  - Badge visibile nel viewer, dialog con motivo, blocco delete manuale e da policy
  - Pagina dedicata `/legal-hold` con lista email protette e rimozione bulk
  - Voce nel menu laterale (admin/superadmin)
- **Importa Email**: nuova pagina `/import` per importare archivi esistenti
  - Formati supportati: PST (Outlook), EML, ZIP di EML, MBOX (Thunderbird/Gmail)
  - Deduplicazione automatica su Message-ID
  - File fino a 500 MB, preservazione struttura cartelle
### Fixed
- **nginx**: aggiunto `X-Forwarded-Host` ??? il manifest Outlook genera ora URL HTTPS
  automaticamente anche senza `APP_URL` configurato nel `.env`

## [0.1.25] - 2026-06-09
### Fixed
- **Security**: Export ZIP includeva email infette (usava `r.rows` invece di `safeEmails`)
- **Security**: Endpoint `/emails/storage` con `mailbox_id` non verificava l'accesso dell'utente
- **Bug**: Ordinamento email (`sort_by`/`sort_dir`) definito ma ignorato nella query SQL
- **Bug**: `OFFSET` negativo se `page=0` causava errore DB in ricerca e lista email
- **Performance**: `graphCrawler` ricalcolava `knownIds` per ogni cartella (1 query ora invece di N)
- **Security/Consistency**: `imapCrawler` salvava email in chiaro invece di cifrato+compresso
- **Accuracy**: `imapCrawler` contava email archiviate anche su `ON CONFLICT DO NOTHING`
- **Bug**: `scheduler` policy con solo `date_to` usava indice parametro SQL errato (crash)

## [0.1.24] - 2026-06-09
### Fixed
- **UID overflow**: readUInt32BE produce valori 0-4.3B, PostgreSQL INTEGER max 2.1B
  Migliaia di email Graph API non venivano inserite. Fix: readInt32BE (INT32 firmato)
  + migrazione DB uid BIGINT

## [0.1.22] - 2026-06-09
### Fixed
- **Plugin tab**: URL manifest e download usavano `.replace(':8080',':3001')` che non funzionava in produzione
  (il backend non e' esposto direttamente ??? nginx gestisce il proxy). Ora usa `window.location.origin`
- **Plugin tab**: aggiunto box con URL manifest e bottone "Copia" per facilitare installazione Outlook
- **Produzione**: impostare `APP_URL=https://mailhaven.k2tech.it` nel `.env` per URL HTTPS nel manifest

## [0.1.21] - 2026-06-08
### Fixed
- **Settings/Aggiornamento**: overlay fullscreen durante update impedisce click su altri tab o link della sidebar
- **Settings/Aggiornamento**: bottone "Salva impostazioni" nascosto quando la tab aggiornamento ?? attiva

## [0.1.20] - 2026-06-08
### Fixed
- **Outlook plugin manifest**: replaced SVG icon with PNG (Office Add-in schema requires PNG, rejects SVG)
- **Outlook plugin manifest**: added `VersionOverrides` v1.0 for modern Outlook 365 task pane button in ribbon
- **Outlook plugin manifest**: added `AppDomains`, bumped internal version to 1.0.1
- **docker-compose.yml**: `./plugins` now mounted as live volume ??? manifest changes don't require image rebuild

## [0.1.19] - 2026-06-08
### Fixed
- **Outlook plugin**: `panel.html` returned React SPA instead of plugin UI (nginx `/plugin` not proxied to backend)
- **Outlook plugin**: manifest URLs used `http://` ??? Office 365 requires HTTPS. Route now auto-detects `X-Forwarded-Proto`
- **Outlook plugin**: `exportEml()` had regex literals instead of template string (JS syntax error)

## [0.1.18] - 2026-06-08
### Fixed
- **graphCrawler**: `listFolders` now recursively fetches `childFolders` for complete folder tree sync
  (sub-folders like Inbox/Glpi, Inbox/helpdesk, INBOX/ok, INBOX/zabb etc. are now synced)
- **graphCrawler**: `folderPath` uses hierarchical `_path` (Parent/Child) for correct folder display
- **gmailCrawler**: `pageAllKnown` was never set to `false`, causing only first 50 messages per label
  to be synced ??? fixed by checking `INSERT ... RETURNING id` result

## [0.1.17] - 2026-06-08
### Fixed
- Plugin Outlook/Thunderbird: l'endpoint GET /api/plugin/emails restituiva errore SQL "syntax error at end of input" nel conteggio totale email a causa di un typo (conditions.slice(0,-0) che in JavaScript restituisce un array vuoto, generando una clausola WHERE senza condizioni). Testato l'intero flusso end-to-end: login, generazione token, lista caselle ed elenco email ora funzionano correttamente


## [0.1.16] - 2026-06-08
### Fixed
- Tabella plugin_tokens (necessaria per generare token Outlook/Thunderbird) mancava nelle migrazioni: era presente solo in init.sql, quindi i database aggiornati da versioni precedenti a 0.0.96 non la possedevano e la generazione token plugin falliva con errore "relation plugin_tokens does not exist". Aggiunta migrazione di recupero automatico


## [0.1.15] - 2026-06-08
### Fixed
- AV Batch Scanner: corretto ReferenceError "result is not defined" nella scrittura del log av_log per ogni allegato (variabile non esistente residuo di refactoring a 3 layer ClamAV+YARA+VirusTotal); ora ogni allegato viene loggato correttamente con il proprio esito ed elenco virus rilevati


## [0.1.14] - 2026-06-08
### Fixed
- Bottoni SSO Microsoft 365 / Google non comparivano in login: ripristinato l'endpoint pubblico /oauth/app-config/public (era assente nel codice nonostante fosse documentato, causando 404 silenzioso lato frontend)


## [0.1.13] - 2026-06-08
### Fixed
- version.json e CHANGELOG non aggiornati nei commit precedenti (0.1.11/0.1.12)

## [0.1.12] - 2026-06-08
### Added
- Wizard OAuth in Impostazioni: componente OAuthWizardTab (era referenziato ma mancante) con guida passo-passo per Microsoft 365 e Google, test di connettivita e pannello stato caselle
- Auto-provisioning utenti SSO: toggle in Impostazioni per creare automaticamente l'utente al primo login con Microsoft 365 / Google
- Endpoint backend GET/POST /oauth/sso-settings per gestire l'auto-provisioning

## [0.1.11] - 2026-06-08
### Fixed
- Pagina di login: bottoni SSO (Microsoft 365 / Google) non comparivano perche veniva chiamato un endpoint autenticato invece di quello pubblico
- Placeholder del campo password corrotto (mostrava simboli "?" invece dei pallini)

## [0.1.10] - 2026-06-06
### Fixed
- Loop di refresh infinito nella pagina di login causato da una chiamata 401 non autenticata (creato endpoint pubblico /oauth/app-config/public e uso di fetch al posto di api)


## [0.0.97] - 2026-06-05
### Added
- YARA Scanner: 11 regole per rilevare PE/ELF, macro Office AutoOpen/Shell, PowerShell encoded, VBScript, HTML phishing, ZIP con eseguibili, PDF con JS
- VirusTotal: hash check SHA-256 come terzo layer AV (attivo se VIRUSTOTAL_API_KEY configurata)
- Rate limiter automatico VirusTotal: max 4 req/min rispettando tier gratuito (500/giorno)
- avBatchScanner: architettura a 3 layer — ClamAV + YARA + VirusTotal per ogni allegato
- Dockerfile: installazione YARA 4.5.5 via apk

## [0.0.96] - 2026-06-05
### Added
- Plugin Outlook: manifest servito dinamicamente da /api/plugin/manifest/outlook con URL server corretto
- Plugin Thunderbird: estensione .xpi scaricabile da /api/plugin/download/thunderbird
- Plugin entrambi: download EML funzionante via /api/plugin/emails/:id/eml
- Plugin entrambi: restore compatibile con caselle OAuth (Graph API per M365, Gmail API per Google)
- Settings Plugin Client: card Outlook e Thunderbird con link download e istruzioni installazione step-by-step
- Icone PNG 48x96 per estensione Thunderbird
### Fixed
- plugin.js restore endpoint: ora usa Graph/Gmail/IMAP in base al provider della casella
- panel.html Outlook: BASE_URL dinamico da window.location.origin invece di placeholder hardcoded
- popup.html Thunderbird: aggiunto download EML


## [0.0.95] - 2026-06-04
### Added
- AV: blocco download allegati per email infette (errore 403)
- AV: banner rosso Virus rilevato nel viewer email
- AV: blocco estensioni pericolose senza ClamAV (.exe .vbs .ps1 .bat .cmd .scr .jar .msi)
- AV: notifica email admin quando virus rilevato (av_notify_on_infection)
- AV: scrittura av_log per ogni allegato scansionato
- AV: email infette escluse da export ZIP e MBOX
### Fixed
- avBatchScanner: paginazione cursor-based invece di OFFSET
- avScheduler: rimossa doppia query DB ridondante

## [0.0.94] - 2026-06-04
### Added
- Graph API: deleteMessages e uploadMessage per policy e restore M365
- Gmail API: deleteMessages e uploadMessage per policy e restore Google
- restore.js: routing automatico Graph/Gmail/IMAP in base al provider
### Fixed
- gmailCrawler: ridotte da 3 a 2 fetch per messaggio
- scheduler.js: policy archiviazione usa Graph/Gmail delete per caselle OAuth

## [0.0.93] - 2026-06-04
### Added
- Token OAuth cifrati AES-256 nel DB
- Badge Token scaduto con link ri-autorizzazione in Admin
### Fixed
- admin.js sync manuale: usa Graph/Gmail per caselle OAuth
- oauthHelper e gmailCrawler: decrypt/encrypt token

## [0.0.92] - 2026-06-04
### Fixed
- setup.js: rimuove duplicati nel .env prima di scrivere nuovi valori

## [0.0.91] - 2026-06-04
### Fixed
- OAuth Microsoft: scopes da IMAP a Graph API (Mail.Read, User.Read)

## [0.0.90] - 2026-06-04
### Fixed
- do-update.sh: risolto detached HEAD permanente con git reset --hard

## [0.0.89] - 2026-06-04
### Added
- gmailCrawler.js: crawler Gmail API per caselle Google OAuth
### Fixed
- graphCrawler.js: UID SHA-256 stabile per evitare collisioni

## [0.0.88] - 2026-06-04
### Added
- graphCrawler.js: crawler Microsoft Graph API sostituisce IMAP XOAUTH2
- Retry automatico su 429/503

## [0.0.87] - 2026-06-04
### Fixed
- Admin: dopo OAuth redirect su tab Caselle Email invece di Clienti
- Admin: toast globale successo/errore OAuth
- scheduler: rimossa chiamata check-update.sh dal container

## [0.0.86] - 2026-06-04
### Added
- Setup: campo URL pubblico per OAuth e accesso esterno
- Settings: campo URL pubblico modificabile post-setup
- docker-compose: .env host montato come volume per scrittura dal setup
### Fixed
- oauth.js: REDIRECT_URI dinamico da APP_URL non piu hardcoded
- index.js: APP_URL caricato dal DB al riavvio container
- Admin: rimossi oauthToast e loadSyncStatus duplicati da ClientsTab e UsersTab

## [0.0.85] - 2026-06-04
### Fixed
- SQL Injection in /admin/av-logs — parametro status ora passato come bind parameter
- Route GET /users duplicata rimossa da admin.js — usava tabella user_clients inesistente, causava crash
- Route GET|PUT /mailboxes/:id/policy triplicate ridotte a una sola definizione
- module.exports spostato alla fine di admin.js — era a meta file (riga 574)
- user_clients sostituita con user_mailboxes in emails.js, restore.js, spam.js — global-search, restore e lista spam per utenti non-admin erano sempre rotti
- Export MBOX e ZIP ora decomprimono il raw prima di scrivere — i file esportati erano corrotti
- crypto.js: doppio module.exports consolidato — encryptBuffer/decryptBuffer ora sempre disponibili
- scheduler.js: deleteFromImap ora salta le caselle OAuth invece di chiamare decrypt(null)
- restore.js: getImapConfig ora gestisce caselle OAuth con errore esplicito invece di null silenzioso
- auth.js: validazione MIME type aggiunta all'upload avatar (era solo estensione nome file)
- auth.js: import uuidv4 inutilizzato rimosso; import duplicato blacklistToken rimosso
- admin.js: password rimossa dall'email di benvenuto — non inviata piu in chiaro
- admin.js: authMiddleware ridondante rimosso dalla route policy
- init.sql: aggiunta colonna archive_policy alla tabella mailboxes
- init.sql: aggiunte colonne timezone, language, phone, avatar_url alla tabella users
- init.sql: aggiunte tabelle mancanti user_sessions, jwt_blacklist, key_rotation_log, reports, report_messages
- init.sql: sync_log ora include tutte le colonne emails_archived, emails_deleted_external, folders_scanned, folders_skipped, details


## [0.0.84] - 2026-05-29
### Added
- Log sync verbosi — dettaglio per cartella con conteggio email sincronizzate, cartelle saltate ed errori
- UI Log: sezione espandibile "Dettaglio cartelle" per ogni sync con stato per cartella
- Contatori folders_scanned e folders_skipped nei log

### Fixed
- EPIPE non gestito causava crash Node.js — aggiunto error handler su socket IMAP
- Log token OAuth verbosi per debug refresh token


## [0.0.83] - 2026-05-29
### Fixed
- Caselle OAuth non venivano mai sincronizzate — scheduler filtrava solo caselle con imap_password_encrypted IS NOT NULL
- Sync IMAP ora esclude cartelle non-email — Calendario, Contatti, Attività, Bozze, Spam, Posta eliminata, Sync Issues
- Eliminazione casella ora pulisce localStorage — evita errore Dashboard su casella non più esistente
- Aggiunto log per-cartella con conteggio email trovate


## [0.0.83] - 2026-05-29
### Fixed
- Caselle OAuth non venivano mai sincronizzate — scheduler filtrava solo caselle con imap_password_encrypted IS NOT NULL, escludendo quelle con oauth_access_token
- Sync IMAP ora esclude cartelle non-email — Calendario, Contatti, Attività, Bozze, Spam, Posta eliminata, Sync Issues; elimina le notifiche "Retrieval using the IMAP4 protocol failed" generate da Exchange


## [0.0.83] - 2026-05-29
### Fixed
- Sync IMAP ora esclude cartelle non-email — Calendario, Contatti, Attività, Bozze, Spam, Posta eliminata, Sync Issues; eliminava le notifiche "Retrieval using the IMAP4 protocol failed" generate da Exchange su elementi non-email


## [0.0.82] - 2026-05-28
### Fixed
- Preview email mostrava "false" nel pannello di anteprima — body_html salvato come stringa "false" invece di NULL quando il parser non trova HTML; aggiunto sanity check prima di restituire il contenuto


## [0.0.81] - 2026-05-28
### Fixed
- OAuth Microsoft: authorization code usabile una sola volta — eliminata doppia chiamata token, email e nome ora letti dall id_token JWT incluso nella risposta
- OAuth Microsoft: aggiunto scope openid, email, profile per garantire la presenza dell id_token
- OAuth Microsoft: rimosso User.Read dagli scope (non necessario con id_token)


## [0.0.80] - 2026-05-28
### Fixed
- OAuth Microsoft: email non trovata per account business/guest con UPN nel formato user_domain.com#EXT#@tenant.onmicrosoft.com — aggiunta ricostruzione email dal formato UPN esteso
- OAuth Microsoft: aggiunto log msUser fields per debug futuro


## [0.0.79] - 2026-05-28
### Fixed
- OAuth callback faceva redirect a /gestione che non esiste in React — corretto in /admin per Microsoft e Google


## [0.0.78] - 2026-05-28
### Added
- Badge OAuth nella lista caselle — mostra logo Microsoft 365 o Google per caselle collegate via OAuth
- Badge "Token in scadenza" in arancione se il refresh token scade entro 7 giorni
- Toast notifica al ritorno dal callback OAuth — verde su successo, rosso su errore, sparisce dopo 5/8s

### Fixed
- Gestione ritorno callback OAuth — query param oauth_success/oauth_error ora letti e puliti dall URL
- admin.js GET /mailboxes — aggiunto oauth_provider e oauth_refresh_expires_at alla SELECT


## [0.0.78] - 2026-05-28
### Added
- Badge OAuth nella lista caselle — mostra logo Microsoft 365 o Google per caselle collegate via OAuth
- Badge "Token in scadenza" in arancione se il refresh token scade entro 7 giorni
- Toast notifica al ritorno dal callback OAuth — verde su successo, rosso su errore, sparisce dopo 5/8s

### Fixed
- Gestione ritorno callback OAuth — query param oauth_success/oauth_error ora letti e puliti dall URL
- admin.js GET /mailboxes — aggiunto oauth_provider e oauth_refresh_expires_at alla SELECT


## [0.0.77] - 2026-05-28
### Fixed
- CORS bloccava il login su produzione — APP_URL mancava nella sezione environment di docker-compose.yml, la variabile non veniva passata al container


## [0.0.77] - 2026-05-28
### Fixed
- CORS bloccava il login su produzione — APP_URL mancava nella sezione environment di docker-compose.yml

## [0.0.76] - 2026-05-27
### Fixed
- Avatar sidebar non si aggiornava senza logout/login — refreshAvatar definita due volte in AuthContext.jsx, useUserAvatar in Layout.jsx faceva fetch una sola volta al mount
- refreshAvatar ora unico useCallback che aggiorna state e localStorage; Layout legge user.avatar_url da AuthContext e chiama refreshAvatar() ad ogni cambio pathname
- multer istanziato a ogni request POST /avatar — spostato al top-level del modulo


## [0.0.77] - 2026-05-28
### Fixed
- CORS bloccava il login su produzione — APP_URL non veniva passato al container perché mancava nella sezione environment di docker-compose.yml

## [0.0.76] - 2026-05-27
### Fixed
- Avatar sidebar non si aggiornava senza logout/login — `refreshAvatar` era definita due volte in `AuthContext.jsx` (una dentro `useEffect` non esposta, una fuori) e `useUserAvatar` in `Layout.jsx` faceva fetch una sola volta al mount con dipendenza `[]`
- `refreshAvatar` è ora un singolo `useCallback` che aggiorna sia lo state React sia `localStorage`; `Layout.jsx` legge `user.avatar_url` direttamente da `AuthContext` e chiama `refreshAvatar()` ad ogni cambio di pathname
- `multer` istanziato a ogni request `POST /avatar` — `require('multer')` e `multer.diskStorage()` erano dentro la route handler; spostati al top-level del modulo

## [0.0.75] - 2026-05-26
### Added
- User Profile — nuova pagina /profile con avatar, nome, telefono, timezone, lingua
- Avatar upload — carica foto profilo JPG/PNG/WEBP max 2MB con validazione
- Avatar predefiniti — 8 avatar SVG geometrici con pattern e icone selezionabili
- Avatar picker — click sull'avatar apre il selettore con preset e upload
- Sessioni attive — lista sessioni con IP, browser, pulsante termina sessione
- Key Rotation — rotazione chiave AES-256 con conferma password (solo superadmin)
- Route PUT /auth/profile — aggiorna nome, telefono, timezone, lingua
- Route POST /auth/avatar — upload immagine profilo con multer
- Route PUT /auth/avatar/preset — selezione avatar predefinito
- Route DELETE /auth/avatar — rimozione avatar
- Route GET /auth/sessions — lista sessioni attive
- Route DELETE /auth/sessions/:id — termina sessione specifica
- Route POST /admin/key-rotation — rotazione chiave con re-cifratura password IMAP
- Tabella user_sessions — traccia sessioni attive con jti, ip, device_info
- Tabella key_rotation_log — storico rotazioni chiave
- Layout — click sull'avatar/nome in basso apre pagina profilo

### Fixed
- auth.js GET /me — ora include timezone, language, phone, avatar_url
- migrate.js — aggiunge colonne timezone, language, phone, avatar_url agli utenti esistenti

### Changed
- index.js — aggiunta route statica /uploads e /avatars per servire file profilo
- Login salva sessione in user_sessions al momento dell'accesso
