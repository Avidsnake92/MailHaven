# Changelog

## [0.0.13] - 2026-05-07
### Added
- Pause/Resume sync button per casella email
- Badge "Sync in pausa" nella lista caselle
- Loading spinner durante eliminazione casella
### Fixed
- sync_paused field incluso nella GET mailboxes
- check-update eseguito in Node.js dentro il container

## [0.0.12] - 2026-05-07
### Fixed
- Email date fallback da header Date quando parsed.date è null
- Colonne mancanti DB per nuove installazioni
- Bottone copia funziona su HTTP

## [0.0.11] - 2026-05-07
### Fixed
- Missing columns in init.sql (compressed_size_bytes, is_deleted, is_restored, av_status)
- Installer modalità base/avanzata con creazione volumi Docker
