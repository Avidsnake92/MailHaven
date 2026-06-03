# Changelog

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
