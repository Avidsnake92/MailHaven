# Changelog

## [0.0.67] - 2026-05-15
### Fixed
- imapCrawler: fix loop infinito policy — email con badge_type=archived non vengono mai resuscitate dal crawler
- imapCrawler: fix deduplicazione message_id — non aggiorna più is_deleted=false su email eliminate da policy
- imapCrawler: fix date 1970 — parser più robusto con 4 candidati (parsed.date, headers Date, Received, IMAP internal date)
- imapCrawler: aggiunta data interna IMAP (attrs.date) come fallback affidabile per il parsing data
- migrate.js: fix automatico date 1970 al riavvio — recupera data dagli header JSON salvati nel DB (max 5000 email per run)

### Changed
- imapCrawler: fetch IMAP ora include envelope:true per leggere attrs.date dal server
- imapCrawler: query deduplicazione message_id include badge_type e is_deleted per decisioni più precise


## [0.0.65] - 2026-05-15
### Added
- Sistema codici errore centralizzati — nuovo file errors.js con codici MH-1xxx
- Middleware errori globale — errorHandler in index.js con JSON strutturato code/error/detail
- Frontend api.js — interceptor axios con err.displayMessage formato [MH-XXXX] Messaggio
- Badge email temporizzati — badge_type (deleted/restored/archived) con scadenza configurabile
- Badge ARCHIVIATA — email da policy mostrano badge grigio permanente distinto da ELIMINATA
- Immutabilità archivio — email mai cancellate dal DB, solo rimosse dall IMAP
- Layout Dashboard 3 pannelli — sidebar cartelle | lista email | preview a destra
- Ordinamento colonne cliccabile — Data e Mittente con indicatore asc/desc
- Endpoint DELETE /emails/delete-imap — eliminazione fisica IMAP per cartella
- Job scheduler pulizia badge — cleanupExpiredBadges() ogni 24h
- Rilevamento eliminazioni esterne — crawler setta badge deleted senza sovrascrivere archived

### Fixed
- Restore bulk con data originale — ogni email ripristinata con il proprio sent_at
- ORDER BY nel backend ora usa safeSortBy/safeSortDir invece di hardcoded sent_at DESC
- Eliminazione casella — fix FK violation spam_cache_mailbox_id_fkey
- imapCrawler.js — rimosso await fuori da contesto async in callback imap.search
- docker-compose.yml — OAUTH_REDIRECT_BASE_URL ora usa variabile da .env

### Changed
- Badge visivi ridisegnati — pill arrotondati, testo maiuscolo bold, sfondo riga bg-red-50/30
- init.sql — aggiunto badge_type, badge_expires_at, badge_duration_days per nuove installazioni
- migrate.js — migration automatica badge su installazioni esistenti
- restore.js — codici errore MH e HTTP 207 per restore parziale
- admin.js — DELETE /mailboxes/:id con AppError MH-1203 e verifica esistenza

### Fixed (installer)
- install.sh — controllo container avviati compatibile con Docker Compose v2 (fix "integer expression expected")


## [0.0.65] - 2026-05-15
### Added
- Sistema codici errore centralizzati — nuovo file errors.js con codici MH-1xxx
- Middleware errori globale — errorHandler in index.js con JSON strutturato code/error/detail
- Frontend api.js — interceptor axios con err.displayMessage formato [MH-XXXX] Messaggio
- Badge email temporizzati — badge_type (deleted/restored/archived) con scadenza configurabile
- Badge ARCHIVIATA — email da policy mostrano badge grigio permanente distinto da ELIMINATA
- Immutabilità archivio — email mai cancellate dal DB, solo rimosse dall IMAP
- Layout Dashboard 3 pannelli — sidebar cartelle | lista email | preview a destra
- Ordinamento colonne cliccabile — Data e Mittente con indicatore asc/desc
- Endpoint DELETE /emails/delete-imap — eliminazione fisica IMAP per cartella
- Job scheduler pulizia badge — cleanupExpiredBadges() ogni 24h
- Rilevamento eliminazioni esterne — crawler setta badge deleted senza sovrascrivere archived

### Fixed
- Restore bulk con data originale — ogni email ripristinata con il proprio sent_at
- ORDER BY nel backend ora usa safeSortBy/safeSortDir invece di hardcoded sent_at DESC
- Eliminazione casella — fix FK violation spam_cache_mailbox_id_fkey
- imapCrawler.js — rimosso await fuori da contesto async in callback imap.search
- docker-compose.yml — OAUTH_REDIRECT_BASE_URL ora usa variabile da .env

### Changed
- Badge visivi ridisegnati — pill arrotondati, testo maiuscolo bold, sfondo riga bg-red-50/30
- init.sql — aggiunto badge_type, badge_expires_at, badge_duration_days per nuove installazioni
- migrate.js — migration automatica badge su installazioni esistenti
- restore.js — codici errore MH e HTTP 207 per restore parziale
- admin.js — DELETE /mailboxes/:id con AppError MH-1203 e verifica esistenza

### Fixed (installer)
- install.sh — controllo container avviati compatibile con Docker Compose v2 (fix "integer expression expected")


## [0.0.28] - 2026-05-07
### Fixed
- Aggiornamento via GUI: usa file trigger invece di exec() dal container
- Cron sull'host rileva update.trigger e lancia do-update.sh (fix definitivo)

## [0.0.27] - 2026-05-07
### Fixed
- Settings: campo password SMTP non perde più focus (Field spostata fuori componente, useRef)
- Settings: indicatore verde "✓ Password già configurata" se password già salvata nel DB
- Settings: bottone "Invia email di test" disabilitato finché host, username e password non sono compilati
- Settings: GET /settings non ritorna mai smtp_pass in chiaro, usa smtp_pass_saved
- SMTP test: usa password salvata nel DB se non viene reinserita

## [0.0.26] - 2026-05-07
### Fixed
- Settings: indicatore visivo "● salvata" accanto al campo password SMTP se già configurata
- Settings: placeholder password diverso se salvata o meno
- Settings: GET /settings non ritorna mai smtp_pass in chiaro, ritorna smtp_pass_saved
- SMTP test: messaggio errore chiaro se password mancante

## [0.0.25] - 2026-05-07
### Fixed
- do-update.sh: aggiunto --no-cache al docker compose build per evitare layer cachati sul frontend

## [0.0.24] - 2026-05-07
### Fixed
- Settings: campo password SMTP usa ref invece di state (fix perdita focus ad ogni carattere)
- Settings: Field spostato fuori dal componente (fix re-mount ad ogni re-render)
- Settings: password non obbligatoria nel test se già salvata nel DB

## [0.0.23] - 2026-05-07
### Fixed
- SMTP: configurazione letta dal DB invece che solo dal .env (niente più riavvio container)
- SMTP test: usa credenziali salvate nel DB, nessuna password richiesta se già salvata
- mailer.js: getSmtpConfig() legge dal DB con fallback su .env

## [0.0.22] - 2026-05-07
### Fixed
- Settings: campo password SMTP perde focus ad ogni tasto (Field definita dentro componente causava re-mount)
- SMTP test: messaggi errore leggibili invece di errori tecnici nodemailer

## [0.0.21] - 2026-05-07
### Fixed
- SMTP test: fix password non trasmessa (defaultValue → value in Settings)
- SMTP test: se password non modificata usa quella salvata nel .env (use_saved_pass)

## [0.0.20] - 2026-05-07
### Fixed
- SMTP test: validazione credenziali prima di tentare invio (evita errore "Missing credentials for PLAIN")
- SMTP test: aggiunto transporter.verify() per verificare connessione prima di inviare

## [0.0.19] - 2026-05-07
### Changed
- Aggiornamento sistema: overlay globale invece di pagina /restarting separata
- Blocco completo UI durante aggiornamento (impossibile navigare o bypassare)
- Doppia conferma prima di avviare aggiornamento (sia modal che banner patch)
- Rimossa route /restarting — UpdateOverlay gestisce tutto in-app

## [0.0.18] - 2026-05-07
### Fixed
- update.js: sostituito bash con sh per lanciare do-update.sh (bash non disponibile nel container alpine)

## [0.0.17] - 2026-05-07
### Fixed
- do-update.sh configura automaticamente il cron per check-update.sh ad ogni aggiornamento

## [0.0.16] - 2026-05-07
### Fixed
- Rimossa chiamata a check-update.sh dallo scheduler Node.js (bash non disponibile nel container)
- Aggiunto cron sull'host per check-update.sh ogni 30 minuti
- install.sh configura automaticamente il cron su nuove installazioni

## [0.0.15] - 2026-05-07
### Fixed
- do-update.sh: aggiunto --build al docker compose up per forzare ricostruzione immagini
- do-update.sh: rimosso blocco git-status.json duplicato
- do-update.sh: rimosso sleep 30 inutile
- do-update.sh: aggiunto rebuild mailhaven-frontend oltre al backend

## [0.0.14] - 2026-05-07
### Fixed
- git-status.json scritto in /app/data/ per evitare conflitti con mount Docker
- Rimosso mount git-status.json da docker-compose (causa directory vs file)
- Delete mailbox usa CASCADE, rimossa query manuale su spam_cache
- Pausa sync funzionante con sync_paused nella GET mailboxes

## [0.0.13] - 2026-05-07
### Added
- Pausa/Riprendi sync per casella email
- Loading spinner durante eliminazione casella
### Fixed
- sync_paused incluso nella GET mailboxes

## [0.0.12] - 2026-05-07
### Fixed
- Email date fallback da header Date
- check-update in Node.js dentro il container
