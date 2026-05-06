# Changelog

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

## [1.1.2] - 2026-05-06
### Corretto
- Dropdown cliente mostra nome e azienda tra parentesi
- Fix do-update rimuove dist prima del build
- Fix nohup per esecuzione indipendente dal backend
