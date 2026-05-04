# Changelog

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
