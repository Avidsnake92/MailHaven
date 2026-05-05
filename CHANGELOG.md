# Changelog

## [1.0.5] - 2026-05-06
### Aggiunto
- Autodetect provider IMAP (Tiscali, Libero, Virgilio, Gmail, Outlook, Yahoo, ecc.)
- Supporto SSL legacy per provider datati (Tiscali, Libero, Virgilio, Tim, Alice)

## [1.0.4] - 2026-05-06
### Aggiunto
- Installer automatico (install.sh) per nuove installazioni
### Corretto
- Fix antispam: cast uuid→text nel JOIN spam_cache/archived_emails
- Mount git-status.json nel container backend per verifica aggiornamenti

## [1.0.3] - 2026-05-05
### Aggiunto
- Pagina di riavvio animata con steps ClamAV e polling automatico
- Polling automatico /health ogni 5 secondi con redirect al login
- Barra di progresso globale e per singolo step durante il riavvio

## [1.0.2] - 2026-05-05
### Aggiunto
- Update UI completamente ridisegnata con animazioni
- Banner aggiornamento disponibile con lista commit in arrivo
- Conferma backup obbligatoria in rosso prima di aggiornare
- Barra di progresso con steps durante l'aggiornamento
- Schermata completato con redirect automatico
- do-update.sh aggiornato con git reset --hard per evitare conflitti

## [1.0.1] - 2026-05-05
### Aggiunto
- Session timeout 30 minuti di inattività con avviso 2 minuti prima
- Refresh token automatico ogni 10 minuti (JWT da 15 minuti)
- Sessione massima 8 ore con logout forzato
- Endpoint /auth/refresh backend
### Corretto
- Build frontend migrata a container node:20-alpine dedicato
- Rimosso mount node_modules dal docker-compose che causava conflitti
- version.json inizializzato correttamente

## [1.0.0] - 2026-05-04
### Aggiunto
- Sistema di archiviazione email IMAP multi-casella multi-cliente
- Cifratura AES-256 delle email nel database
- Antivirus ClamAV integrato con scansione allegati e batch scanner automatico
- Full-text search con PostgreSQL GIN index
- Backup cifrato formato .mhbak su NAS via SFTP
- Restore email su IMAP, export ZIP/MBOX/EML
- OAuth2 Microsoft 365 e Google / Gmail
- Plugin Outlook Web Add-in e Thunderbird Extension
- Gestione multi-cliente con ruoli granulari (Superadmin/Admin/Utente)
- Dashboard con highlight ricerca, scudo AV, badge email ripristinate/eliminate
- Storage dashboard per ruolo (casella/cliente/VM)
- Sicurezza integrata in Impostazioni (2FA TOTP, account bloccati)
- Sistema di aggiornamento con verifica changelog da GitHub
