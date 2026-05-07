# Changelog

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
