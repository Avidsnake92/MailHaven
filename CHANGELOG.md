# Changelog

## [0.0.74] - 2026-05-24
### Added
- Security: CORS whitelist con supporto reti locali automatico (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
- Security: CSP abilitato con policy completa
- Security: JWT blacklist su PostgreSQL — logout invalida il token sul backend
- Security: route POST /auth/logout con invalidazione token
- Security: middleware validate.js per schema validation senza dipendenze esterne
- Security: input sanitization middleware (rimuove chiavi con $ e .)
- Security: PostgreSQL pool tuning (max 20 conn, timeout, statement_timeout)
- Security: 404 handler globale
- Security: jwtBlacklist.js — servizio blacklist con cleanup automatico ogni ora

### Fixed
- crypto.js: fix encryptBuffer/decryptBuffer usavano utf8 invece di hex per la chiave — causava Invalid key length
- migrate.js: fix date 1970 ora prova tutti i formati header (date, Date, received, Received)
- Logs.jsx: rimossi simboli )} spurii dopo ogni log sync
- index.js: rimosse route duplicate (oauth, update, reports montate due volte)
- auth.js: aggiunto jti ai token JWT per supporto blacklist
- admin.js: validate schema su createUser

### Changed
- index.js: helmet hardened con CSP completo, HSTS, referrer policy
- auth middleware: controlla blacklist JWT ad ogni richiesta
- AuthContext: logout chiama API /auth/logout prima di rimuovere token locale


## [0.0.72] - 2026-05-20
### Added
- Bottone "Applica policy alle email già archiviate" in Impostazioni Sincronizzazione — elimina dall'IMAP le email già in archivio che rientrano nei criteri della policy
- Route POST /emails/apply-policy/:mailbox_id per applicare policy manualmente

### Fixed
- Bottone sync manuale — ora attende il completamento prima di rispondere, lo spinner rimane visibile per tutta la durata della sync
- imapCrawler: contatore processed++ ora incrementa solo su INSERT reale, non su email saltate per message_id noto
- Dashboard: testi e icone scalati a dimensione intermedia (text-sm, icone +2px)

### Changed
- Route POST /emails/sync/:mailbox_id — risposta sincrona invece di fire-and-forget, include emails sincronizzate nel response


## [0.0.65] - 2026-05-15
### Added
- **Sistema codici errore centralizzati** — nuovo file `errors.js` con codici MH-1xxx per tutte le funzioni (autenticazione, caselle, sync IMAP, email, ripristino, policy, antivirus, backup, sistema)
- **Middleware errori globale** — `errorHandler` in `index.js` intercetta tutti gli errori e restituisce JSON strutturato con `code`, `error`, `detail`
- **Frontend `api.js`** — interceptor axios arricchisce ogni errore con `err.displayMessage` nel formato `[MH-XXXX] Messaggio`
- **Badge email temporizzati** — nuovo sistema `badge_type` (`deleted` / `restored` / `archived`) con scadenza configurabile in Impostazioni (`badge_duration_days`, default 30 giorni)
- **Badge ARCHIVIATA** — email rimosse da policy archiviazione mostrano badge grigio permanente distinto da badge rosso ELIMINATA
- **Immutabilità archivio** — le email non vengono mai cancellate dal DB; l'eliminazione rimuove solo dall'IMAP e aggiorna il badge
- **Layout Dashboard 3 pannelli** — sidebar cartelle | lista email | preview a destra con apertura inline senza cambiare pagina
- **Ordinamento colonne cliccabile** — header Data, Mittente ordinabili con indicatore visivo asc/desc; fix bug `ORDER BY` hardcoded nel backend
- **Endpoint `DELETE /emails/delete-imap`** — eliminazione fisica dall'IMAP con raggruppamento per cartella
- **Endpoint `POST /emails/delete`** aggiornato — setta `badge_type` e `badge_expires_at` invece di solo `is_deleted`
- **Job scheduler pulizia badge** — `cleanupExpiredBadges()` gira ogni 24h e azzera i badge scaduti
- **Rilevamento eliminazioni esterne** — il crawler IMAP rileva email sparite da Outlook/webmail e setta badge `deleted` senza sovrascrivere badge `archived`

### Fixed
- **Restore bulk con data originale** — `uploadToImap()` ora riceve `sentAt` per ogni email individualmente; fix bug scope variabile che causava data corrente per tutte le email nel bulk
- **Ordinamento email** — `ORDER BY` nel backend ora usa `safeSortBy`/`safeSortDir` invece di essere hardcoded su `sent_at DESC`
- **Eliminazione casella** — aggiunto `DELETE FROM archived_emails` e `DELETE FROM spam_cache` prima di `DELETE FROM mailboxes` per rispettare FK; fix errore FK violation `spam_cache_mailbox_id_fkey`
- **`imapCrawler.js`** — rimosso `await` fuori da contesto async (dentro callback `imap.search`) che causava `Scheduler error: await is only valid in async functions`
- **`docker-compose.yml`** — `OAUTH_REDIRECT_BASE_URL` era hardcoded `https://mailhaven.k2tech.it`, ora usa variabile `${OAUTH_REDIRECT_BASE_URL}` dal `.env`

### Changed
- **Badge visivi ridisegnati** — pill arrotondati con bordo, testo in maiuscolo bold, icone più piccole; riga eliminata passa da `opacity-60` a sfondo `bg-red-50/30` per leggibilità
- **`init.sql`** — aggiunto `badge_type`, `badge_expires_at`, indice su `badge_expires_at`, setting `badge_duration_days` per nuove installazioni
- **`migrate.js`** — aggiunta migration automatica per `badge_type`, `badge_expires_at`, indice e setting su installazioni esistenti
- **`restore.js`** — route `/imap` aggiornata con codici errore MH e risposta HTTP 207 per restore parziale
- **`admin.js`** — route `DELETE /mailboxes/:id` usa `AppError` con codice MH-1203 e verifica esistenza casella prima di eliminare

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
