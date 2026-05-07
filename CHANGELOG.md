# Changelog

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
