# Changelog

## [1.1.5] - 2026-05-06
### Corretto
- Fix: dopo aggiornamento i commit si allineano correttamente
- Delay 30s prima di check-update per attendere riavvio backend

## [1.1.4] - 2026-05-06
### Aggiunto
- Colonna Azienda in lista utenti
- Check aggiornamenti automatico ogni 30 minuti in background
### Corretto
- Fix antispam: cast uuid→text nel JOIN
- Fix encoding caratteri speciali in tabella utenti

## [1.1.3] - 2026-05-06
### Aggiunto
- Bottone Sync animato in Email Archiviate
- Tab Log Sync con polling 5 secondi e storico per casella
- Pulizia automatica log sync ogni 60 giorni
- Animazione 1.5s su verifica aggiornamenti
