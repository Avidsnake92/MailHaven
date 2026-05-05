# Changelog

## [1.1.1] - 2026-05-06
### Aggiunto
- Notifica automatica aggiornamenti all'avvio per superadmin
- Popup prominente per aggiornamenti major/minor con lista novità
- Banner discreto per aggiornamenti patch
- Fix volumi external in docker-compose.yml
- Fix path mailhaven in build-frontend.sh

## [1.1.0] - 2026-05-06
### Modificato
- Rinominato progetto da MailVault a MailHaven in tutti i componenti
- Rinominati container Docker (mailhaven-backend, mailhaven-frontend, mailhaven-db)
- Rinominati volumi Docker e network
- Rinominato database e utente PostgreSQL da mailvault a mailhaven
- Aggiornato nginx.conf con nuovo nome backend
- Aggiornati tutti gli script

## [1.0.6] - 2026-05-06
### Aggiunto
- Barra di stato sync per ogni casella email in Gestione
- Modal log sync con storico ultimi 20 sync, durata e errori

## [1.0.5] - 2026-05-06
### Aggiunto
- Autodetect provider IMAP (Tiscali, Libero, Virgilio, Gmail, Outlook, Yahoo, ecc.)
- Supporto SSL legacy per provider datati

## [1.0.4] - 2026-05-06
### Aggiunto
- Installer automatico (install.sh)
### Corretto
- Fix antispam uuid cast
- Mount git-status.json nel container backend

## [1.0.3] - 2026-05-05
### Aggiunto
- Pagina di riavvio animata con steps ClamAV e polling automatico

## [1.0.2] - 2026-05-05
### Aggiunto
- Update UI completamente ridisegnata con animazioni
- Banner aggiornamento, conferma backup, barra progresso

## [1.0.1] - 2026-05-05
### Aggiunto
- Session timeout 30 minuti, refresh token automatico, sessione max 8h
### Corretto
- Build frontend migrata a node:20-alpine
- Rimosso mount node_modules dal docker-compose

## [1.0.0] - 2026-05-04
### Aggiunto
- Sistema di archiviazione email IMAP multi-casella multi-cliente
- Cifratura AES-256, ClamAV, full-text search, backup SFTP/S3
- OAuth2 Microsoft 365 e Google, plugin Outlook/Thunderbird
- Dashboard, storage, sicurezza, sistema aggiornamento
