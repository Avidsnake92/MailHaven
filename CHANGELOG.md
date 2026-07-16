# Changelog

## [0.1.87] - 2026-07-16
### Added
- **Backoff sui fallimenti di sincronizzazione.** Se una casella fallisce ripetutamente
  il login (tipico di Tiscali/Libero, che bloccano temporaneamente l'IMAP dopo troppi
  tentativi), lo scheduler smette di ritentare ogni ciclo e rallenta progressivamente
  su QUELLA casella: i primi 2 fallimenti sono trattati come transitori, poi le riprove
  passano a 30 min → 2h → 6h → 12h (cap). Appena un tentativo riesce (o con un
  "Sincronizza ora" manuale) il contatore si azzera e la sincronizzazione riprende
  normale. Nuove colonne `mailboxes.sync_fail_count` / `sync_retry_after`.
### Changed
- **Niente più email di errore sync a ogni ciclo.** L'avviso ai superadmin viene ora
  inviato SOLO al primo fallimento di una serie, non a ogni tentativo: una casella a
  lungo irraggiungibile non genera più decine di email.

## [0.1.86] - 2026-07-16
### Fixed
- **Il tasto "Copia" (ID installazione e altri) non copiava nulla su installazioni
  in HTTP.** `navigator.clipboard` e' disponibile solo in contesti sicuri (HTTPS o
  localhost): sulle installazioni raggiunte via `http://IP:8080` l'API non esiste e
  la copia falliva in silenzio, costringendo a selezionare il testo a mano. Aggiunto
  un helper `services/clipboard.js` con fallback (textarea + execCommand) usato dal
  pannello Licenza e dagli altri pulsanti di copia in Impostazioni; se anche il
  fallback fallisce, l'utente viene avvisato.

## [0.1.85] - 2026-07-16
### Fixed
- **Le funzioni sbloccate da una licenza non comparivano nel menu finche' non si
  usciva e rientrava.** Il menu dipende da `user.entitlements`, caricato al login:
  applicando (o rimuovendo) una Feature Key da Impostazioni -> Licenza, la chiave
  veniva salvata correttamente ma il menu restava sull'edizione precedente
  (Antivirus, Antispam, Backup, Legal Hold, Import, Ricerca globale, MSP mancanti).
  Aggiunto `refreshUser()` nel contesto di autenticazione: dopo aver attivato o
  rimosso la licenza, gli entitlements vengono rical­cati da `/auth/me` e il menu
  si aggiorna subito, senza dover rifare il login.

## [0.1.84] - 2026-07-16
### Added
- **Aggiornamenti: rollback automatico.** Se dopo un aggiornamento il backend non
  torna "healthy" entro 120s, `do-update.sh` ripristina automaticamente il commit
  precedente e ricompila: un aggiornamento difettoso diventa un breve disservizio
  auto-recuperato invece di lasciare l'istanza ferma. Se anche il rollback fallisce
  lo stato resta "error" (serve intervento manuale).
- **Avviso via email agli amministratori** quando un aggiornamento fallisce o
  scatta il rollback: `do-update.sh` lascia un file d'allerta che il backend, al
  riavvio sulla versione ripristinata, invia a tutti i superadmin tramite l'SMTP
  gia' configurato (nessun endpoint o segreto aggiuntivo). La UI mostra lo stato
  "versione ripristinata" invece di restare in attesa.

## [0.1.83] - 2026-07-16
### Changed
- **Installer Thunderbird: consente l'estensione non firmata.** Poiche' il `.xpi`
  non e' firmato da Mozilla (scelta di progetto: non passeremo da ATN), Thunderbird
  lo rifiuterebbe come "non verificato". L'installer ora scrive
  `user_pref("xpinstall.signatures.required", false);` nel `user.js` di ogni
  profilo (UTF8 senza BOM, senza duplicare se gia' presente) e la rimuove in
  disinstallazione. NB: se una build di Thunderbird ignora la preferenza (come fa
  Firefox release), l'estensione restera' rifiutata: da verificare sul campo.

## [0.1.82] - 2026-07-15
### Fixed
- **Estensione Thunderbird: il popup non poteva aprirsi.** `manifest.json`
  dichiarava `"default_popup": "popup/popup.html"` ma nel pacchetto `popup.html`
  sta nella radice: il percorso non esisteva, quindi cliccando l'icona non sarebbe
  successo nulla. Corretto il percorso e ricostruito il `.xpi` verificando che
  TUTTI i file dichiarati nel manifest (popup e icone) esistano davvero.
### Note
- Il `.xpi` **non e' firmato** da Mozilla/ATN: le versioni release di Thunderbird
  rifiutano le estensioni non firmate. Per la distribuzione ai clienti va
  sottomesso ad addons.thunderbird.net per la firma, oppure usato su Thunderbird
  ESR con `xpinstall.signatures.required=false`.

## [0.1.81] - 2026-07-15
### Fixed
- **Add-in Outlook installabile su qualsiasi PC.** L'add-in referenziava le interop
  di Office presenti nella GAC (`Extensibility`, `office`), che NON vengono
  distribuite con l'installer e su un PC con solo Office 365 possono mancare: li'
  l'add-in non si sarebbe caricato. Ora i tipi COM sono **incorporati**
  (EmbedInteropTypes, stessi GUID): la DLL dipende solo da .NET Framework 4.8 e
  dagli assembly WebView2 gia' inclusi nell'installer.
- **L'installer avvisa se manca il runtime WebView2** (necessario al pannello),
  con il link per scaricarlo, invece di lasciare una finestra vuota.
- L'installer ripulisce anche lo stato interno dell'add-in in Outlook, che se
  sporco (es. dopo un crash) fa ignorare l'add-in senza nemmeno elencarlo.

## [0.1.80] - 2026-07-15
### Added
- **Ripristino email dal plugin.** Nel pannello dell'add-in Outlook, aprendo
  un'email c'e' il pulsante "Ripristina nella casella": rimette il messaggio nella
  casella di origine (IMAP / Microsoft 365 / Gmail), nella cartella da cui era
  stato archiviato. Conferma a due click (un click accidentale non rimanda nulla).
### Fixed
- **Add-in Outlook: crash del runtime .NET dentro Outlook.** `IDTExtensibility2` e
  `IRibbonExtensibility` erano dichiarate a mano: layout COM errato -> access
  violation in `clr.dll` (Outlook si chiudeva, in modo intermittente). Ora si usano
  le interop UFFICIALI di Office presenti nella GAC (`Extensibility`, `Office`),
  le stesse che userebbe VSTO. La barra ha ora una scheda dedicata "MailHaven"
  (dopo "Guida") invece di un gruppo agganciato alla scheda Home.
- **Ripristino su cartelle non esistenti sul server.** Le email importate in
  cartelle logiche (es. quelle dell'agent Windows) non si ripristinavano: la
  cartella non esiste su IMAP e certi server non permettono di crearla (namespace
  con prefisso `INBOX.`). Ora, se la cartella non e' apribile ne' creabile, l'email
  viene ripristinata in INBOX; la risposta indica la cartella realmente usata.
- **Flag "letto" errato nel ripristino**: `flags: ['\Seen']` era scritto `['\Seen']`
  con un solo backslash, che in JavaScript vale `Seen` invece di `\Seen`.
- **Installer**: ripulisce la quarantena di Outlook e lo stato interno dell'add-in,
  che se sporco fa ignorare l'add-in senza nemmeno elencarlo.

## [0.1.79] - 2026-07-15
### Fixed
- **Add-in Outlook: il pulsante non compariva.** Dopo il crash della versione
  precedente, Outlook aveva RIMOSSO la chiave di registrazione dell'add-in
  (`HKCU\Software\Microsoft\Office\Outlook\Addins\MailHaven.Connect`): senza
  quella l'add-in non viene nemmeno caricato. L'installer ora ricrea sempre la
  registrazione e ripulisce la quarantena di Outlook.
- **`GetCustomUI` restituiva l'XML della ribbon per OGNI finestra di Outlook**,
  anche per quelle del messaggio, dove la scheda `TabMail` non esiste: Office
  poteva scartare l'intera personalizzazione (nessun pulsante). Ora l'XML viene
  restituito solo per la finestra principale (Explorer).

## [0.1.78] - 2026-07-13
### Fixed
- **L'add-in COM di Outlook faceva crashare Outlook** ("Outlook ha rilevato un
  problema con un componente aggiuntivo e lo ha disabilitato"). `IDTExtensibility2`
  e `IRibbonExtensibility` erano dichiarate come IDispatch, mentre in Office sono
  interfacce **duali**: Outlook chiamava i metodi via vtable in posizioni
  inesistenti. Ora sono dichiarate `InterfaceIsDual` e la classe usa `AutoDual`,
  necessario anche perche' Office risolva le callback della ribbon per nome.
  L'installer ora ripulisce la quarantena di Outlook (Resiliency\DisabledItems e
  CrashingAddinList) e aggiunge l'add-in a DoNotDisableAddinList.
### Changed
- **Pannello Plugin: "Token di accesso" diventa "Client collegati".** I plugin si
  autenticano da soli al primo accesso (server + credenziali, `/plugin/login`
  emette il token): i pulsanti per generare token a mano creavano token inutili e
  sono stati rimossi. Resta l'elenco dei client attivi (tipo, ultimo utilizzo,
  scadenza) con la revoca, utile per staccare un PC perso o un ex dipendente.

## [0.1.77] - 2026-07-13
### Added
- **Add-in Outlook COM in stile MailStore.** Il nuovo `MailHaven-Outlook-Setup.exe`
  installa un vero add-in COM (non più il web add-in Office.js, che NON funziona
  con le caselle IMAP): in Outlook compare il pulsante "Archivio MailHaven" nella
  scheda Home; al click si apre una finestra dove si indica il server, si accede
  con le proprie credenziali e si sfoglia/cerca/apre l'archivio — con qualsiasi
  tipo di account. Funziona via WebView2 sul pannello servito dal backend.
- **Endpoint pannello archivio**: `GET /api/plugin/panel` serve la UI
  (`plugins/outlook/panel-archive.html`) usata dall'add-in; login e navigazione
  sono same-origin (nessun problema di CORS). Usa le API plugin già esistenti
  (`/login`, `/mailboxes`, `/emails`, `/emails/:id`, `/emails/:id/eml`).
### Note
- Sorgenti dell'add-in (.NET) in `claudio/mailhaven-outlook` (fuori da questo repo).

## [0.1.76] - 2026-07-13
### Changed
- **Pannello Plugin semplificato**: rimosse le opzioni di installazione manuale
  (URL/download manifest XML per Outlook e download .xpi per Thunderbird) - resta
  solo "Scarica installer (.exe)" per entrambi i client. Gli endpoint restano
  attivi lato server (l'installer Thunderbird scarica lo .xpi da li e Outlook
  registra il manifest via URL).

## [0.1.75] - 2026-07-13
### Added
- **Installer .exe per il plugin Thunderbird** (`MailHaven-Thunderbird-Setup.exe`):
  GUI in italiano che rileva i profili Thunderbird (profiles.ini), installa
  l'estensione in tutti i profili e supporta la disinstallazione; lo .xpi viene
  scaricato dal server MailHaven (URL configurabile) o usato dal file locale.
  Modalità CLI: `-Silent` / `-Remove`. Sorgente: `plugins/thunderbird/Install-MailHavenThunderbird.ps1`
  (compilato con ps2exe).
- **Endpoint pubblici di download installer**: `GET /api/plugin/download/outlook-setup`
  e `GET /api/plugin/download/thunderbird-setup` (pacchetti client, nessun dato
  sensibile). `install-info` aggiornato con i nuovi passi.
### Fixed
- **Il download dello .xpi Thunderbird da Impostazioni era rotto** (401): il link
  `<a>` non può inviare il token Bearer ma l'endpoint richiedeva l'autenticazione.
  Ora è pubblico, e il file scaricato ha il nome giusto (`mailhaven-archive.xpi`,
  prima veniva salvato come `.json`).
- **Pannello Plugin ridisegnato**: pulsante principale "Scarica installer (.exe)"
  per Outlook e Thunderbird, installazione manuale (manifest XML / .xpi) come
  opzione secondaria, istruzioni aggiornate.

## [0.1.74] - 2026-07-11
### Added
- **Integrazione ITFlow — import clienti via API.** Nuovo pulsante "Importa da
  ITFlow" in Utenti/Caselle → Clienti (solo superadmin): si configura URL + API key
  di ITFlow (salvate nelle settings, la key non lascia mai il server), si vede
  l'elenco dei clienti ITFlow con spunte e si importano i selezionati come Aziende.
  Il collegamento è ricordato in `clients.itflow_client_id` (indice univoco):
  reimportare non crea doppioni, i già importati sono marcati, le aziende omonime
  esistenti vengono COLLEGATE invece che duplicate. Endpoint: GET/POST
  `/api/itflow/config`, GET `/api/itflow/clients`, POST `/api/itflow/import`
  (tutti superadmin, audit ITFLOW). Contratto ITFlow: GET
  `{base}/api/v1/clients/read.php?api_key=…` → `{success,data:[…]}`.

## [0.1.73] - 2026-07-10
### Added
- **Ricerca Globale come funzione licenziabile (`global_search`).** La Feature Key
  può ora includere/escludere la Ricerca Globale come antivirus, antispam, legal hold
  ecc. Route `GET /emails/global-search` gateata (403 MH-1010 se non in licenza), voce
  menu nascosta per edizione, etichetta nel pannello Licenza. Community: esclusa.
  **Retro-compatibilità**: le chiavi emesse prima di questa versione (senza il flag
  nel payload) mantengono la Ricerca Globale attiva.
### Fixed
- **Ricerca Globale rotta per tutti (500).** La query COUNT riceveva anche il
  parametro LIMIT che non usa (PostgreSQL: "bind message supplies N parameters...")
  e la numerazione del filtro caselle collideva con i filtri data. Parametri
  ristrutturati: lista base condivisa items/count + LIMIT aggiunto solo alla items.

## [0.1.72] - 2026-07-10
### Fixed
- **Restore IMAP: `target_mailbox` accetta ora sia l'ID numerico sia l'email della
  casella** (prima solo l'email); con casella inesistente risponde 404 "Casella non
  trovata" (MH-1201) invece del fuorviante "Credenziali IMAP non configurate" (MH-1204).
- **Ripuliti gli ultimi caratteri corrotti** rimasti nei commenti del backend
  (frecce e separatori in auth.js, oauth.js, migrate.js).

## [0.1.71] - 2026-07-10
### Fixed
- **Rilevamento "eliminate esternamente" completamente rotto (mismatch di tipo UID).**
  La colonna `uid` è `bigint` e node-postgres la restituisce come **stringa**, mentre
  `imap.search` dà **numeri**: ogni confronto falliva. Effetti: TUTTE le email
  archiviate venivano marcate "eliminate esternamente" a ogni sync (anche quelle
  appena archiviate e ancora presenti sul server), il ripristino automatico del flag
  non scattava mai, e ogni email del server veniva ritrattata come "nuova" a ogni
  ciclo. Ora gli UID dal DB sono normalizzati a Number prima del confronto.
- **UID driftati: riallineamento automatico.** Se un client sposta/ricarica un
  messaggio l'UID cambia; il dedup per Message-ID evitava il doppione ma la copia
  archiviata restava "eliminata" per sempre con l'UID vecchio. Ora quando il crawler
  rivede un Message-ID noto sotto un UID nuovo aggiorna l'UID salvato e toglie il flag.
- **Log "N email eliminate esternamente" ripetuto a ogni ciclo.** Il conteggio
  includeva anche le email già marcate: ora considera solo quelle attive e il log
  compare solo quando c'è davvero qualcosa da marcare.
- **`GET /oauth/mailboxes-status` restituiva sempre 500.** La query SQL era
  letteralmente vuota (`db.query()` senza testo) dalla nascita dell'endpoint:
  ricostruita (caselle OAuth attive con scadenze token).

## [0.1.70] - 2026-07-10
### Fixed
- **Caratteri accentati corrotti (`??`) nelle scritte dell'interfaccia.** Le pagine
  Legal Hold, Login, Impostazioni (sezioni SSO/OAuth), Import e il dialog Legal Hold
  in EmailView erano state salvate con encoding errato: à è é ° • — → ⚠️ erano
  diventati `??`. Ripristinati tutti i testi corretti (es. "Cosa è il Legal Hold?",
  "Test connettività", "Verifica identità", "n°123", frecce nelle guide OAuth).
  Corretto anche il messaggio backend "Email già presente" (import).

## [0.1.69] - 2026-06-30
### Fixed
- **Scroll delle pagine a tutta larghezza.** Backup, Impostazioni, Utenti/Caselle,
  Log, Email e Sicurezza usavano un contenitore di scroll limitato al box centrato
  (`max-w-* mx-auto h-full overflow-y-auto`): la rotellina funzionava solo col cursore
  DENTRO il riquadro, non nei margini. Ora lo scroll è gestito dal layout su tutta la
  larghezza dell'area contenuti, quindi si scorre ovunque.
## [0.1.68] - 2026-06-30
### Fixed
- **Il wizard di configurazione ora appare DAVVERO sulle installazioni nuove.**
  La migrazione all'avvio marcava `setup_completed=true` se esisteva un superadmin;
  ma `init.sql` crea un superadmin segnaposto (`admin@mailhaven.local`) su ogni DB
  nuovo → il wizard veniva saltato su OGNI installazione pulita (compariva il login).
  Ora l'auto-completamento considera solo un superadmin REALE (esclude il segnaposto):
  le installazioni nuove partono dal wizard; gli aggiornamenti da versioni vecchie
  restano invariati. Questo era la causa radice di "il wizard non parte".
## [0.1.67] - 2026-06-30
### Fixed
- **Primo avvio delle installazioni NUOVE molto più veloce e affidabile.**
  L'entrypoint del backend eseguiva ClamAV (`freshclam`) in modo **bloccante**:
  su un'installazione pulita il download del database virus (~minuti) teneva il
  backend "unhealthy", e di conseguenza il frontend (che dipende dal backend
  healthy) e il **wizard** non partivano finché ClamAV non finiva. Ora ClamAV
  viene configurato/aggiornato **in background**: Node (portale + wizard) parte in
  pochi secondi; l'antivirus diventa disponibile poco dopo. Nessun impatto sulle
  installazioni già avviate.
## [0.1.66] - 2026-06-30
### Fixed
- **Il wizard di configurazione ora appare in modo affidabile.** All'apertura il
  frontend RIPROVA `/setup/status` (fino a ~90s) se il backend è ancora in avvio,
  invece di ripiegare subito sul login: era la causa di "il wizard non parte" su
  installazioni appena create.
### Added
- **Anteprima wizard (dev/diagnostica).** Pulsante superadmin in Impostazioni
  "Mostra wizard (anteprima)" per rivedere il wizard su un'istanza già configurata,
  in modalità SICURA: il completamento è disattivato e non viene scritto nulla
  (`/setup/complete` resta 403). Endpoint `POST /setup/preview`; `/setup/status`
  espone il flag `preview`. Banner con "Esci anteprima" per tornare.
## [0.1.65] - 2026-06-29
### Added
- **Licenza — verifica online opzionale (revoca a distanza).** Nuovo client
  `services/licenseSync.js` **fail-open**: se è configurato un server licenze,
  l'istanza sincronizza ogni 6h (e on-demand) e applica l'eventuale **revoca**
  → torna a Community (dati intatti, ingest mai bloccato). Se il server è giù,
  lo stato NON cambia. Sezione "Verifica online" in Impostazioni → Licenza
  (URL server + "Sincronizza ora" + ultima sincronizzazione). Endpoint
  `POST /license/server` e `POST /license/sync`. La CLI di emissione stampa ora
  il **Key ID** (utile per la revoca puntuale).
- **Server di licenze di riferimento** in `license-server/` (Express minimale +
  CLI `revoke.js`), da deployare dove si vuole. Revoca per **ID installazione**
  o **Key ID**; endpoint pubblico `/verify` e admin protetti da token.
## [0.1.64] - 2026-06-29
### Added
- **Licenza — Fase 3: gate delle funzioni per edizione.** Le funzioni Pro sono ora
  bloccate nelle edizioni che non le includono (es. Community): Backup, Import,
  Antispam (intera sezione), Antivirus (route + scansione batch) e Legal Hold
  rispondono 403 se non in licenza. Gli scheduler antivirus e antispam saltano il
  lavoro quando la funzione non è licenziata.
- **Menu e avvisi licenza**: le voci di menu delle funzioni non incluse vengono
  nascoste in base all'edizione; banner globale quando la licenza è **in scadenza**,
  **in tolleranza** o **scaduta**, con link rapido a Impostazioni → Licenza.
## [0.1.63] - 2026-06-29
### Changed
- **Sistema di aggiornamento più robusto e trasparente.**
  - Nuovo **agente host unico** `mh-agent.sh` (un solo cron): heartbeat + verifica
    periodica + esecuzione update, con auto-installazione (`mh-agent.sh install`).
    Sostituisce i due cron separati che si perdevano.
  - **"Verifica aggiornamenti" ora fa un controllo REALE** (git fetch tramite agente)
    invece di rileggere una cache: niente più pulsante che "non fa niente".
  - Il pannello mostra lo **stato del motore aggiornamenti** (attivo/non attivo +
    "ultimo controllo"), con avviso rosso se l'agente non gira.
  - `do-update.sh` **indurito**: allineamento con fetch + reset e token (invece di
    git pull, che si rompeva su tree sporco/HEAD distaccato) + self-heal del file di stato.
  - Rimosso il **mount fragile** di update-status.json (causa del bug "is a directory").
  - Endpoint: `POST /update/check`; `/update/status` espone `agent`, `lastCheck`, `fetchOk`.
## [0.1.62] - 2026-06-29
### Added
- **Edizione "A vita" (lifetime)**: licenza illimitata (caselle, aziende e
  rivenditori senza tetto) e **senza scadenza**. Emissibile da CLI
  (`--lifetime` o `--edition lifetime`) e dall'app di emissione. Nel pannello
  Impostazioni → Licenza compare col badge "A vita", limiti "Illimitato" e
  scadenza "Nessuna (a vita)".
## [0.1.61] - 2026-06-29
### Added
- **Licenza — Fase 2 (UI + emissione)**. Nuova sezione **Impostazioni → Licenza**
  (solo superadmin): mostra edizione, stato, scadenza, limiti e funzioni incluse,
  l'**ID installazione** copiabile, e permette di **attivare/rimuovere** una Feature
  Key. Nuovi endpoint `GET/POST/DELETE /api/license`.
- **CLI di emissione** `tools/mailhaven-license.js`: genera una Feature Key firmata
  dato ID installazione, edizione (pro/msp), limiti e scadenza (usa la chiave privata,
  che resta fuori dal repository). Supporta `--unbound` per chiavi non legate.
- Voce di menu Sistema → Licenza.
## [0.1.60] - 2026-06-29
### Added
- **Edizioni & licenza (Feature Key, stile WatchGuard)** — Fase 1. Nuovo
  `services/license.js`: verifica OFFLINE di una chiave firmata Ed25519 (chiave
  pubblica incorporata), legata all'ID installazione generato a runtime. Senza
  chiave valida l'istanza è **Community** (1 azienda, 25 caselle, niente MSP).
  Gestione scadenza con periodo di tolleranza (grace) e successivo declassamento
  a Community — i dati restano e l'acquisizione email non si ferma mai.
- Edizione ed entitlements esposti al frontend in login e `/auth/me`.
### Changed
- Enforcement edizione in admin.js: limite aziende e caselle per edizione + gate
  della gestione rivenditori (richiede licenza MSP).
## [0.1.59] - 2026-06-29
### Changed
- **Setup wizard — riavvio intelligente**: la schermata finale ora sonda `/api/health`
  e reindirizza al login appena il backend è di nuovo online (mostra spinner→spunta
  "Tutto pronto"), invece di aspettare 60s fissi. Tetto di sicurezza a 90s.
### Added
- **Setup wizard — ritocchi**: pulsante "Usa l'indirizzo rilevato" per pre-compilare
  l'URL pubblico con l'origine corrente del browser; avviso "Caps Lock attivo" sui
  campi password dell'amministratore.
## [0.1.58] - 2026-06-29
### Changed
- **Setup wizard rinnovato**: nuovo layout split-screen con pannello brand a sinistra
  (gradiente, logo, stepper verticale con avanzamento e descrizioni) e form pulito a
  destra. Su mobile barra di avanzamento compatta in alto. Schermata finale di riavvio
  rifinita. Logica invariata: stesse chiamate API, generazione chiavi, validazioni,
  test SMTP e redirect al login.
## [0.1.57] - 2026-06-25
### Added
- **Scoring antispam automatico (Rspamd)**: nuovo `spamScheduler` che in background
  valuta le email non ancora analizzate (mh_spam_score NULL), a piccoli blocchi
  (100/giro ogni 10 min, con pausa) per non saturare il box; salta il giro se Rspamd
  non risponde. Attivabile/disattivabile dal superadmin (impostazione spam_autoscore,
  interruttore nel pannello Antispam). Non serve più premere "Analizza" a mano.
### Fixed
- Vincolo `spam_cache.mailbox_id` ricreato con ON DELETE CASCADE (su installazioni
  vecchie poteva mancare): l'eliminazione delle caselle è ora robusta anche senza
  la cancellazione manuale preventiva.
## [0.1.56] - 2026-06-25
### Added
- **UI Antispam con punteggio MailHaven (Rspamd)**: toggle "Origine / MailHaven" per
  scegliere quale punteggio usare come filtro, e nuova colonna che mostra sempre il
  punteggio indipendente di MailHaven (con azione rspamd, es. ⛔ reject). La GET /spam
  accetta `source=origin|mh` ed espone mh_spam_score in entrambe le viste.
## [0.1.55] - 2026-06-25
### Added
- **Secondo motore antispam (Rspamd)**: nuovo container `mailhaven-rspamd` (capped a
  400MB) che dà un punteggio antispam INDIPENDENTE all'archivio, in aggiunta a quello
  del mail server di origine. Nuovi campi su archived_emails: `mh_spam_score`,
  `mh_spam_action`, `mh_spam_symbols`, `mh_spam_at`. Servizi `rspamdClient.js`
  (API /checkv2) e `spamScorer.js` (batch). Il pulsante "Analizza" ora calcola anche
  il punteggio MailHaven. Self-hosted: i dati non escono dal server.
## [0.1.54] - 2026-06-25
### Fixed (sicurezza Antispam)
- `DELETE /spam/:email_id` ora verifica la proprietà della casella e blocca le email
  in Legal Hold (prima eliminava qualsiasi email per id, cross-tenant e bypassando
  il Legal Hold).
- `POST /spam/analyze/:mailbox_id` verifica che la casella sia del chiamante.
- `POST /spam/settings` (soglia globale) consentito solo al superadmin; nel frontend
  il pulsante "Salva soglia" è nascosto agli altri ruoli (per loro la soglia filtra
  solo la propria vista).
- In `analyze`, il flag is_spam usa ora la soglia configurata invece di un valore fisso.
## [0.1.53] - 2026-06-25
### Added
- **Filtro per tipo di azione nell'Audit**: menu a tendina (Creazioni, Modifiche,
  Eliminazioni, Accessi, Backup, Ripristini, Legal Hold, Antispam, Sincronizzazioni)
  oltre alla ricerca testuale.
### Changed
- **Log dei backup spostati nella sezione Log**: nuova scheda "Log → Backup"
  (visibile a superadmin e ai reseller con Backup attivo, scoped). Rimossi dalla
  pagina Backup, che ora rimanda alla nuova posizione.
## [0.1.52] - 2026-06-24
### Changed
- **Audit: descrizione sempre visibile**: la frase con il nome dell'entità (es.
  «Eliminato rivenditore «Mario»») è ora mostrata sempre nella riga, non più
  nascosta sugli schermi stretti. Le voci create prima della v0.1.49 non hanno il
  nome (non era stato catturato) e mostrano solo l'etichetta dell'azione.
## [0.1.51] - 2026-06-24
### Changed
- **Dettagli audit più chiari**: il pannello espanso di ogni voce mostra ora la
  frase descrittiva e i soli campi utili etichettati (Nome, Email, Azienda, Ruolo,
  Destinazione...), invece dei campi tecnici grezzi (method/params/path). Le voci
  vecchie senza descrizione ricadono sull'etichetta leggibile dell'azione.
## [0.1.50] - 2026-06-24
### Changed
- **UI Backup rinnovata**: nuovo header con icona, sottotitolo e una striscia di
  stato a colpo d'occhio (Destinazione, Ultimo backup, Pianificazione attiva/manuale).
  Lista dei backup modernizzata (badge icona, nome file monospace, pill della
  dimensione). Logica invariata.
## [0.1.49] - 2026-06-24
### Changed
- **Audit log più leggibile**: ogni voce ha ora una descrizione chiara in italiano
  con il NOME dell'entità (risolto prima dell'eliminazione), es. «Eliminato cliente
  «Acme Srl»», «Creata casella «mario@x.it»», «Sbloccato l'utente «...»». Il frontend
  mostra la frase descrittiva e un'etichetta colorata ricavata dal tipo di azione,
  invece dei codici grezzi e del path tecnico.
## [0.1.48] - 2026-06-24
### Added
- **Restore dei backup funzionante (B) + per il reseller (C)**: il restore prima
  era uno stub (scaricava il .mhbak ma non reimportava nulla). Ora `restoreFromMhbak`
  scarica il backup da S3/SFTP, lo decifra, scompatta le EML e le reimporta
  davvero (riuso di `insertEmail`: uid stabile, compressione+cifratura, dedup per
  message_id). Il reseller può ripristinare i PROPRI .mhbak SOLO nelle proprie
  caselle (le voci per caselle non sue vengono saltate). Pulsante "Ripristina"
  riabilitato anche per il reseller.
### Fixed
- Restore non più no-op: reimport reale, idempotente (nessun duplicato al
  secondo restore) e con isolamento multi-tenant in scrittura.
## [0.1.47] - 2026-06-24
### Added
- **Audit log completo**: nuovo middleware che registra in `activity_log` OGNI
  azione mutante (POST/PUT/DELETE/PATCH) andata a buon fine, con utente, azione
  leggibile (es. CLIENTE_CREATO, CASELLA_ELIMINATO, UTENTE_MODIFICATO), dettagli
  (metodo, path, parametri, body con credenziali oscurate) e IP. Montato su
  admin, import, backup, restore, antispam ed email. Le GET non vengono loggate,
  le richieste fallite (>=400) nemmeno. La voce di menu "Accessi" è ora "Audit".
  I log restano scoped: il reseller vede solo le azioni dei propri utenti.
## [0.1.46] - 2026-06-24
### Fixed
- **Eliminazione casella non funzionante**: la colonna `mailboxes.status`, usata
  dal flusso di eliminazione asincrona, non esisteva sul DB -> ogni eliminazione
  falliva con errore 500. Aggiunta la colonna (migrazione idempotente).
- **Eliminazione caselle molto grandi**: le email ora vengono cancellate a blocchi
  di 2000 e senza `statement_timeout`, così anche caselle con decine di migliaia di
  messaggi (es. 40k) si eliminano senza superare il limite di 30s. La UI mostra già
  la riga di caricamento durante l'operazione.
## [0.1.45] - 2026-06-24
### Added
- **Backup reseller — Fase 3c-3 (schedule cron)**: nuovo `backupScheduler.js` che
  esegue i backup pianificati via cron, sia globali (superadmin) sia per-reseller.
  Avviato al boot e ricaricato al salvataggio della configurazione. Prima il campo
  `schedule` non veniva eseguito da nessuno: ora un backup con orario impostato e
  abilitato parte automaticamente.
## [0.1.44] - 2026-06-23
### Added
- **Backup reseller — Fase 3c-4 (UI)**: il rivenditore con `feat_backup` ha la voce
  "Backup" nel menu e accede alla pagina Backup, dove configura/testa la propria
  destinazione S3/SFTP, avvia il backup (.mhbak scoped) e vede l'elenco e i log
  dei propri backup. Il pulsante "Ripristina" è nascosto al reseller (restore
  resta solo-superadmin per ora).
## [0.1.43] - 2026-06-23
### Added
- **Backup reseller — Fase 3c-2 (esecuzione)**: nuovo servizio `resellerBackup.js`
  che genera un backup nel formato proprietario **.mhbak** (magic MHBK, cifrato con
  ENCRYPTION_KEY) contenente SOLO le email dei clienti del reseller, e lo carica
  sulla sua destinazione S3 o SFTP. `/backup/run`, `/backup/list` e `/backup/logs`
  ora funzionano per il reseller, scoped sulla sua configurazione e sui suoi dati.
  Il restore resta per ora solo-superadmin (3c successiva).
## [0.1.42] - 2026-06-23
### Added
- **Antivirus e Antispam come feature a pacchetto reseller** (`feat_antivirus`,
  `feat_antispam`): il rivenditore vede la sezione Antivirus (stato+log) e la
  pagina Antispam solo se abilitate, e solo sui propri clienti.
### Changed
- L'Antivirus e' stato separato dal pacchetto Log: `feat_logs` ora copre solo
  Accessi e Sync; l'Antivirus dipende da `feat_antivirus`. La pagina Log mostra
  le tab in base ai flag. Il toggle notifiche AV (globale) resta solo superadmin.
## [0.1.41] - 2026-06-23
### Added
- **Backup reseller — Fase 3c-1 (config)**: `backup_config`/`backup_log` ora
  possono appartenere a un reseller (`reseller_id`, NULL = globale). Con
  `feat_backup` attivo il rivenditore configura e testa la PROPRIA destinazione
  S3/SFTP, isolata dalla configurazione globale del superadmin.
- Le route di esecuzione (`/run`,`/list`,`/restore`,`/logs`) restano per ora
  solo-superadmin: l'esecuzione del backup scoped per reseller (formato
  proprietario .mhbak, solo dati dei suoi clienti) arriva nella 3c-2.
## [0.1.40] - 2026-06-23
### Added
- **Log per il reseller (Fase 3b)**: con `feat_logs` attivo il rivenditore vede
  Accessi, Sync e Antivirus, ma SOLO relativi ai propri clienti. Il toggle delle
  notifiche AV (impostazione globale) resta nascosto al reseller.
### Fixed
- **Sicurezza Log**: `/admin/logs` (attivita) ora e' scoped anche per gli admin
  (prima un admin vedeva l'attivita di tutti i clienti). `/admin/sync-status` e
  `/admin/av-stats`/`/admin/av-logs` scoped per ruolo.
- Corretto un bug di indicizzazione dei parametri nel conteggio di `/admin/av-logs`
  quando si filtrava per stato.
## [0.1.39] - 2026-06-23
### Added
- **Colonna "Rivenditore"** nella tabella Clienti (solo superadmin): mostra quale
  rivenditore ha creato il cliente, oppure "Diretto" se creato dal superadmin.
### Fixed
- Tabella Rivenditori: rimossa la barra di scorrimento spuria che compariva
  all'apertura del menu azioni (wrapper overflow-x rimosso).
## [0.1.38] - 2026-06-23
### Added
- **Import per il reseller (Fase 3a-bis)**: con `feat_import` attivo il rivenditore
  può importare email (EML/ZIP/MBOX/PST) solo nelle caselle dei propri clienti.
### Fixed
- **Sicurezza Import**: le route `/import/*` ora validano che la casella di
  destinazione appartenga al chiamante (prima un admin poteva importare in
  qualunque casella). Il superadmin resta senza vincoli.
## [0.1.37] - 2026-06-23
### Added
- **Feature a pacchetto per il reseller (Fase 3a)**: nuovi flag attivabili dal
  superadmin sul pacchetto reseller (`feat_legal_hold`, `feat_import`, `feat_logs`,
  `feat_backup`) con checkbox "Funzioni incluse" nel form Rivenditore. I flag
  arrivano alla sessione via login e `/auth/me`.
- **Legal Hold per il reseller**: con `feat_legal_hold` attivo il reseller vede e
  usa il Legal Hold, ma SOLO sulle email dei propri clienti.
### Fixed
- **Sicurezza Legal Hold**: `POST /emails/legal-hold` e `/legal-hold/list` ora
  applicano lo scoping per casella (prima un admin poteva mettere/vedere il Legal
  Hold su email di qualunque cliente). Il superadmin resta globale.
## [0.1.36] - 2026-06-23
### Added
- **Reseller — UI (Fase 2)**: nuova tab "Rivenditori" (solo superadmin) con
  pacchetto e uso aggregato (spazio/caselle/utenti/aziende), creazione/modifica
  rivenditore e creazione del relativo utente di accesso.
- Vista rivenditore: menu ridotto (Principale + Gestione "Aziende e Caselle"),
  può creare le proprie aziende con sotto-quote e creare utenti/admin per esse.
  Route /admin accessibile anche al ruolo reseller.
## [0.1.35] - 2026-06-23
### Added
- **Reseller (MSP multi-livello) — fondamenta backend**: nuovo ruolo `reseller`
  che gestisce solo i propri clienti (aziende), i loro utenti e caselle.
  - Nuova tabella `resellers` (pacchetto venduto: spazio/caselle/utenti) +
    `clients.reseller_id` e `users.reseller_id`. `reseller_id` incluso nel JWT.
  - Isolamento: il reseller vede e modifica SOLO i propri clienti (scoping in
    `getUserMailboxIds`, `checkMailbox`/`checkUser`, liste clienti/utenti/caselle,
    storage). Allowlist: al reseller sono negate le route di sistema (log,
    impostazioni, backup, statistiche, storage VM).
  - CRUD clienti per il reseller (crea/modifica/elimina solo i propri).
  - Quote a due livelli: la somma delle sotto-quote dei clienti non può superare
    il pacchetto del reseller (allocazione), e il superamento dell'uso totale del
    pacchetto blocca la creazione di nuove risorse (l'archiviazione non si ferma).
  - Endpoint `/admin/resellers` (solo superadmin) con uso aggregato per gestire i
    rivenditori. Il superadmin può creare l'utente di login `reseller`.
- Verificato con test automatico end-to-end (18/18): isolamento, allowlist e i
  due livelli di quota.
## [0.1.34] - 2026-06-23
### Added
- **Quote per cliente (MSP)**: nuovi limiti su `clients` — spazio (`quota_bytes`),
  numero caselle (`max_mailboxes`) e utenti (`max_users`). NULL = illimitato.
  - Enforcement commerciale: la creazione di nuove caselle/utenti viene bloccata
    (409) al superamento del limite o della quota di spazio; l'archiviazione delle
    email esistenti non viene MAI interrotta.
  - `GET /admin/storage/clients` espone uso vs quota (percentuale, over-quota, conteggi).
  - UI: form Cliente con sezione Quote (solo superadmin) e colonna Quota con barra
    di utilizzo in Storage → Per cliente.
## [0.1.33] - 2026-06-22
### Changed
- **Menu laterale consolidato**: la navigazione è ora compatta con gruppi a
  comparsa. Sezione "Principale" (Dashboard, Email Archiviate, Ricerca Globale,
  Antispam) sempre visibile; gruppi collassabili "Amministrazione" (Utenti e
  Caselle, Legal Hold, Importa Email) e "Sistema" (Backup + tab Impostazioni).
- **Sezione Log dedicata** con i tre tipi: Accessi, Sync Mail, Antivirus.
- **Segnalazioni** spostata in fondo come voce autonoma, con icona bug.
- Voce "Gestione" rinominata in "Utenti e Caselle". Nessuna route modificata.
## [0.1.32] - 2026-06-22
### Fixed
- **Pagina Utenti in crash (schermata bianca)**: in `UsersTab` (Admin.jsx) il toast
  di errore usava `deleteError`/`setDeleteError` senza il relativo `useState`,
  causando un `ReferenceError`. Aggiunto lo stato e collegato `handleDelete` per
  mostrare l'eventuale errore (es. 403 su utenti di altri clienti) invece di
  ignorarlo silenziosamente.
## [0.1.31] - 2026-06-22
### Security
- **Isolamento multi-tenant (MSP)**: le route di amministrazione e l'API plugin
  applicano ora controlli di proprietà per `client_id`, non solo per ruolo. Un
  utente `admin` (referente di un singolo cliente) è confinato al proprio cliente
  e non può più leggere, modificare o eliminare caselle, utenti o email di altri
  clienti.
  - `admin.js`: `GET /mailboxes` e `GET /sync-status` filtrati per cliente;
    `PUT/DELETE/toggle/sync/pause/sync-status/policy /mailboxes/:id` verificano la
    proprietà della casella; `POST/PUT /mailboxes` e `POST /users` forzano il
    `client_id` dell'admin; impedita l'escalation di privilegi via `PUT /users/:id`
    (un admin non può più promuovere a `admin`/`superadmin` né spostare utenti tra
    clienti); assegnazione caselle↔utenti e `unlock` verificano la proprietà.
  - `restore.js`: `POST /export/mailbox` valida la casella richiesta contro quelle
    consentite (prima qualunque utente poteva esportare qualsiasi casella).
  - `plugin.js`: `pluginAuth` espone `client_id`; `/mailboxes`, `/emails`,
    `/emails/:id`, `/emails/:id/restore` ora scoped sulle caselle consentite.
  - `getUserMailboxIds` di `spam.js` e `restore.js` allineato a `emails.js`
    (l'admin vede solo le caselle del proprio cliente, non tutte).
## [0.1.30] - 2026-06-10
### Added
- **Barra di progresso reale per gli aggiornamenti**: `do-update.sh` scrive lo
  stato corrente (step, percentuale, messaggio) in `data/update-status.json`,
  servito staticamente da nginx anche durante il riavvio dei container.
  Il frontend mostra il progresso reale invece di una stima a tempo fisso, e
  un messaggio "Aggiornamento completato con successo!" prima del ricaricamento
  automatico della pagina

### Fixed
- **Pannello di aggiornamento duplicato**: rimossa la visualizzazione "a specchio"
  del progresso aggiornamento dietro al modal
- **Commenti con encoding errato** in `emails.js` (sezione Legal Hold)

## [0.1.29] - 2026-06-10
### Security
- **Rate limiting su `/api/plugin/login`**: applicato l'`authLimiter` (20 tentativi/15min)
  anche al login del plugin Outlook, per bloccare il brute force sulle credenziali
- **Rate limit per utenti autenticati**: aggiunto un limite generoso (3000 richieste/15min,
  per utente e non per IP) come rete di sicurezza contro account compromessi o script
  impazziti, senza introdurre attriti nell'uso normale
- **OAuth state firmato**: lo state dei flussi OAuth Microsoft e Google e' ora firmato
  con HMAC-SHA256 (chiave JWT_SECRET), verificato con confronto a tempo costante e
  scaduto dopo 10 minuti — previene forging/CSRF sul callback OAuth
- **CSP irrigidita**: rimosso `'unsafe-eval'` da `script-src` (non necessario nella
  build statica di produzione)
- **Script `rotate-secrets.sh`**: nuovo script per ruotare `JWT_SECRET` e `DB_PASSWORD`
  (con backup di `.env`, `ALTER ROLE` su Postgres e riavvio coordinato dei container)

### Fixed
- **`backend/src/routes/import.js`**: rimosso BOM UTF-8 e ripulita una riga di commento
  con encoding corrotto
- **Typo `.env`**: corretto `VIROSTOTAL_API_KEY` → `VIRUSTOTAL_API_KEY` (la chiave
  VirusTotal era ignorata e la scansione antivirus esterna risultava disattivata)

## [0.1.28] - 2026-06-09
### Added
- **Installer Outlook EXE**: `plugins/outlook/MailHaven-Outlook-Setup.exe` — wizard
  grafico per installare il plugin Outlook Classic senza privilegi admin, registra
  il manifest via chiave registro HKCU, supporta URL server personalizzato e
  disinstallazione dal Pannello di Controllo
- **Pagina manutenzione durante aggiornamento**: durante il restart del backend
  l'utente vede una pagina branded "Aggiornamento in corso" con spinner e
  riconnessione automatica ogni 5 secondi invece della 502 del browser
- **do-update.sh sequenziale**: backup DB in background (non bloccante),
  rebuild backend → attesa healthy → rebuild frontend

### Fixed
- **Eliminazione casella di posta asincrona**: il delete ora risponde 202 subito
  e cancella in background; la UI mostra "Eliminazione in corso..." animato
  con polling ogni 2 secondi fino alla scomparsa dalla lista
- **Rate limiting**: gli utenti autenticati (JWT valido) non hanno più limiti
  sulle chiamate API; l'authLimiter (20 req/15min) si applica solo a
  `/auth/login` e `/auth/2fa/verify-sso` per bloccare brute force
- **check-update.sh**: confronta ora con `origin/main` invece del commit del tag,
  eliminando i falsi positivi "aggiornamenti disponibili" dopo hotfix post-release
- **Verifica aggiornamenti 502**: retry automatico dopo 3s su 502/503 con
  messaggi human-friendly (backend in restart, permessi, offline)
- **Dockerfile CMD**: corretta sintassi CMD con path tra virgolette
- **Manifest Outlook Version**: formato 4-part `1.0.0.1` richiesto da Office

## [0.1.26] - 2026-06-09
### Added
- **Legal Hold**: protezione email da eliminazione per conservazione legale
  - Badge visibile nel viewer, dialog con motivo, blocco delete manuale e da policy
  - Pagina dedicata `/legal-hold` con lista email protette e rimozione bulk
  - Voce nel menu laterale (admin/superadmin)
- **Importa Email**: nuova pagina `/import` per importare archivi esistenti
  - Formati supportati: PST (Outlook), EML, ZIP di EML, MBOX (Thunderbird/Gmail)
  - Deduplicazione automatica su Message-ID
  - File fino a 500 MB, preservazione struttura cartelle
### Fixed
- **nginx**: aggiunto `X-Forwarded-Host` ??? il manifest Outlook genera ora URL HTTPS
  automaticamente anche senza `APP_URL` configurato nel `.env`

## [0.1.25] - 2026-06-09
### Fixed
- **Security**: Export ZIP includeva email infette (usava `r.rows` invece di `safeEmails`)
- **Security**: Endpoint `/emails/storage` con `mailbox_id` non verificava l'accesso dell'utente
- **Bug**: Ordinamento email (`sort_by`/`sort_dir`) definito ma ignorato nella query SQL
- **Bug**: `OFFSET` negativo se `page=0` causava errore DB in ricerca e lista email
- **Performance**: `graphCrawler` ricalcolava `knownIds` per ogni cartella (1 query ora invece di N)
- **Security/Consistency**: `imapCrawler` salvava email in chiaro invece di cifrato+compresso
- **Accuracy**: `imapCrawler` contava email archiviate anche su `ON CONFLICT DO NOTHING`
- **Bug**: `scheduler` policy con solo `date_to` usava indice parametro SQL errato (crash)

## [0.1.24] - 2026-06-09
### Fixed
- **UID overflow**: readUInt32BE produce valori 0-4.3B, PostgreSQL INTEGER max 2.1B
  Migliaia di email Graph API non venivano inserite. Fix: readInt32BE (INT32 firmato)
  + migrazione DB uid BIGINT

## [0.1.22] - 2026-06-09
### Fixed
- **Plugin tab**: URL manifest e download usavano `.replace(':8080',':3001')` che non funzionava in produzione
  (il backend non e' esposto direttamente ??? nginx gestisce il proxy). Ora usa `window.location.origin`
- **Plugin tab**: aggiunto box con URL manifest e bottone "Copia" per facilitare installazione Outlook
- **Produzione**: impostare `APP_URL=https://mailhaven.k2tech.it` nel `.env` per URL HTTPS nel manifest

## [0.1.21] - 2026-06-08
### Fixed
- **Settings/Aggiornamento**: overlay fullscreen durante update impedisce click su altri tab o link della sidebar
- **Settings/Aggiornamento**: bottone "Salva impostazioni" nascosto quando la tab aggiornamento ?? attiva

## [0.1.20] - 2026-06-08
### Fixed
- **Outlook plugin manifest**: replaced SVG icon with PNG (Office Add-in schema requires PNG, rejects SVG)
- **Outlook plugin manifest**: added `VersionOverrides` v1.0 for modern Outlook 365 task pane button in ribbon
- **Outlook plugin manifest**: added `AppDomains`, bumped internal version to 1.0.1
- **docker-compose.yml**: `./plugins` now mounted as live volume ??? manifest changes don't require image rebuild

## [0.1.19] - 2026-06-08
### Fixed
- **Outlook plugin**: `panel.html` returned React SPA instead of plugin UI (nginx `/plugin` not proxied to backend)
- **Outlook plugin**: manifest URLs used `http://` ??? Office 365 requires HTTPS. Route now auto-detects `X-Forwarded-Proto`
- **Outlook plugin**: `exportEml()` had regex literals instead of template string (JS syntax error)

## [0.1.18] - 2026-06-08
### Fixed
- **graphCrawler**: `listFolders` now recursively fetches `childFolders` for complete folder tree sync
  (sub-folders like Inbox/Glpi, Inbox/helpdesk, INBOX/ok, INBOX/zabb etc. are now synced)
- **graphCrawler**: `folderPath` uses hierarchical `_path` (Parent/Child) for correct folder display
- **gmailCrawler**: `pageAllKnown` was never set to `false`, causing only first 50 messages per label
  to be synced ??? fixed by checking `INSERT ... RETURNING id` result

## [0.1.17] - 2026-06-08
### Fixed
- Plugin Outlook/Thunderbird: l'endpoint GET /api/plugin/emails restituiva errore SQL "syntax error at end of input" nel conteggio totale email a causa di un typo (conditions.slice(0,-0) che in JavaScript restituisce un array vuoto, generando una clausola WHERE senza condizioni). Testato l'intero flusso end-to-end: login, generazione token, lista caselle ed elenco email ora funzionano correttamente


## [0.1.16] - 2026-06-08
### Fixed
- Tabella plugin_tokens (necessaria per generare token Outlook/Thunderbird) mancava nelle migrazioni: era presente solo in init.sql, quindi i database aggiornati da versioni precedenti a 0.0.96 non la possedevano e la generazione token plugin falliva con errore "relation plugin_tokens does not exist". Aggiunta migrazione di recupero automatico


## [0.1.15] - 2026-06-08
### Fixed
- AV Batch Scanner: corretto ReferenceError "result is not defined" nella scrittura del log av_log per ogni allegato (variabile non esistente residuo di refactoring a 3 layer ClamAV+YARA+VirusTotal); ora ogni allegato viene loggato correttamente con il proprio esito ed elenco virus rilevati


## [0.1.14] - 2026-06-08
### Fixed
- Bottoni SSO Microsoft 365 / Google non comparivano in login: ripristinato l'endpoint pubblico /oauth/app-config/public (era assente nel codice nonostante fosse documentato, causando 404 silenzioso lato frontend)


## [0.1.13] - 2026-06-08
### Fixed
- version.json e CHANGELOG non aggiornati nei commit precedenti (0.1.11/0.1.12)

## [0.1.12] - 2026-06-08
### Added
- Wizard OAuth in Impostazioni: componente OAuthWizardTab (era referenziato ma mancante) con guida passo-passo per Microsoft 365 e Google, test di connettivita e pannello stato caselle
- Auto-provisioning utenti SSO: toggle in Impostazioni per creare automaticamente l'utente al primo login con Microsoft 365 / Google
- Endpoint backend GET/POST /oauth/sso-settings per gestire l'auto-provisioning

## [0.1.11] - 2026-06-08
### Fixed
- Pagina di login: bottoni SSO (Microsoft 365 / Google) non comparivano perche veniva chiamato un endpoint autenticato invece di quello pubblico
- Placeholder del campo password corrotto (mostrava simboli "?" invece dei pallini)

## [0.1.10] - 2026-06-06
### Fixed
- Loop di refresh infinito nella pagina di login causato da una chiamata 401 non autenticata (creato endpoint pubblico /oauth/app-config/public e uso di fetch al posto di api)


## [0.0.97] - 2026-06-05
### Added
- YARA Scanner: 11 regole per rilevare PE/ELF, macro Office AutoOpen/Shell, PowerShell encoded, VBScript, HTML phishing, ZIP con eseguibili, PDF con JS
- VirusTotal: hash check SHA-256 come terzo layer AV (attivo se VIRUSTOTAL_API_KEY configurata)
- Rate limiter automatico VirusTotal: max 4 req/min rispettando tier gratuito (500/giorno)
- avBatchScanner: architettura a 3 layer — ClamAV + YARA + VirusTotal per ogni allegato
- Dockerfile: installazione YARA 4.5.5 via apk

## [0.0.96] - 2026-06-05
### Added
- Plugin Outlook: manifest servito dinamicamente da /api/plugin/manifest/outlook con URL server corretto
- Plugin Thunderbird: estensione .xpi scaricabile da /api/plugin/download/thunderbird
- Plugin entrambi: download EML funzionante via /api/plugin/emails/:id/eml
- Plugin entrambi: restore compatibile con caselle OAuth (Graph API per M365, Gmail API per Google)
- Settings Plugin Client: card Outlook e Thunderbird con link download e istruzioni installazione step-by-step
- Icone PNG 48x96 per estensione Thunderbird
### Fixed
- plugin.js restore endpoint: ora usa Graph/Gmail/IMAP in base al provider della casella
- panel.html Outlook: BASE_URL dinamico da window.location.origin invece di placeholder hardcoded
- popup.html Thunderbird: aggiunto download EML


## [0.0.95] - 2026-06-04
### Added
- AV: blocco download allegati per email infette (errore 403)
- AV: banner rosso Virus rilevato nel viewer email
- AV: blocco estensioni pericolose senza ClamAV (.exe .vbs .ps1 .bat .cmd .scr .jar .msi)
- AV: notifica email admin quando virus rilevato (av_notify_on_infection)
- AV: scrittura av_log per ogni allegato scansionato
- AV: email infette escluse da export ZIP e MBOX
### Fixed
- avBatchScanner: paginazione cursor-based invece di OFFSET
- avScheduler: rimossa doppia query DB ridondante

## [0.0.94] - 2026-06-04
### Added
- Graph API: deleteMessages e uploadMessage per policy e restore M365
- Gmail API: deleteMessages e uploadMessage per policy e restore Google
- restore.js: routing automatico Graph/Gmail/IMAP in base al provider
### Fixed
- gmailCrawler: ridotte da 3 a 2 fetch per messaggio
- scheduler.js: policy archiviazione usa Graph/Gmail delete per caselle OAuth

## [0.0.93] - 2026-06-04
### Added
- Token OAuth cifrati AES-256 nel DB
- Badge Token scaduto con link ri-autorizzazione in Admin
### Fixed
- admin.js sync manuale: usa Graph/Gmail per caselle OAuth
- oauthHelper e gmailCrawler: decrypt/encrypt token

## [0.0.92] - 2026-06-04
### Fixed
- setup.js: rimuove duplicati nel .env prima di scrivere nuovi valori

## [0.0.91] - 2026-06-04
### Fixed
- OAuth Microsoft: scopes da IMAP a Graph API (Mail.Read, User.Read)

## [0.0.90] - 2026-06-04
### Fixed
- do-update.sh: risolto detached HEAD permanente con git reset --hard

## [0.0.89] - 2026-06-04
### Added
- gmailCrawler.js: crawler Gmail API per caselle Google OAuth
### Fixed
- graphCrawler.js: UID SHA-256 stabile per evitare collisioni

## [0.0.88] - 2026-06-04
### Added
- graphCrawler.js: crawler Microsoft Graph API sostituisce IMAP XOAUTH2
- Retry automatico su 429/503

## [0.0.87] - 2026-06-04
### Fixed
- Admin: dopo OAuth redirect su tab Caselle Email invece di Clienti
- Admin: toast globale successo/errore OAuth
- scheduler: rimossa chiamata check-update.sh dal container

## [0.0.86] - 2026-06-04
### Added
- Setup: campo URL pubblico per OAuth e accesso esterno
- Settings: campo URL pubblico modificabile post-setup
- docker-compose: .env host montato come volume per scrittura dal setup
### Fixed
- oauth.js: REDIRECT_URI dinamico da APP_URL non piu hardcoded
- index.js: APP_URL caricato dal DB al riavvio container
- Admin: rimossi oauthToast e loadSyncStatus duplicati da ClientsTab e UsersTab

## [0.0.85] - 2026-06-04
### Fixed
- SQL Injection in /admin/av-logs — parametro status ora passato come bind parameter
- Route GET /users duplicata rimossa da admin.js — usava tabella user_clients inesistente, causava crash
- Route GET|PUT /mailboxes/:id/policy triplicate ridotte a una sola definizione
- module.exports spostato alla fine di admin.js — era a meta file (riga 574)
- user_clients sostituita con user_mailboxes in emails.js, restore.js, spam.js — global-search, restore e lista spam per utenti non-admin erano sempre rotti
- Export MBOX e ZIP ora decomprimono il raw prima di scrivere — i file esportati erano corrotti
- crypto.js: doppio module.exports consolidato — encryptBuffer/decryptBuffer ora sempre disponibili
- scheduler.js: deleteFromImap ora salta le caselle OAuth invece di chiamare decrypt(null)
- restore.js: getImapConfig ora gestisce caselle OAuth con errore esplicito invece di null silenzioso
- auth.js: validazione MIME type aggiunta all'upload avatar (era solo estensione nome file)
- auth.js: import uuidv4 inutilizzato rimosso; import duplicato blacklistToken rimosso
- admin.js: password rimossa dall'email di benvenuto — non inviata piu in chiaro
- admin.js: authMiddleware ridondante rimosso dalla route policy
- init.sql: aggiunta colonna archive_policy alla tabella mailboxes
- init.sql: aggiunte colonne timezone, language, phone, avatar_url alla tabella users
- init.sql: aggiunte tabelle mancanti user_sessions, jwt_blacklist, key_rotation_log, reports, report_messages
- init.sql: sync_log ora include tutte le colonne emails_archived, emails_deleted_external, folders_scanned, folders_skipped, details


## [0.0.84] - 2026-05-29
### Added
- Log sync verbosi — dettaglio per cartella con conteggio email sincronizzate, cartelle saltate ed errori
- UI Log: sezione espandibile "Dettaglio cartelle" per ogni sync con stato per cartella
- Contatori folders_scanned e folders_skipped nei log

### Fixed
- EPIPE non gestito causava crash Node.js — aggiunto error handler su socket IMAP
- Log token OAuth verbosi per debug refresh token


## [0.0.83] - 2026-05-29
### Fixed
- Caselle OAuth non venivano mai sincronizzate — scheduler filtrava solo caselle con imap_password_encrypted IS NOT NULL
- Sync IMAP ora esclude cartelle non-email — Calendario, Contatti, Attività, Bozze, Spam, Posta eliminata, Sync Issues
- Eliminazione casella ora pulisce localStorage — evita errore Dashboard su casella non più esistente
- Aggiunto log per-cartella con conteggio email trovate


## [0.0.83] - 2026-05-29
### Fixed
- Caselle OAuth non venivano mai sincronizzate — scheduler filtrava solo caselle con imap_password_encrypted IS NOT NULL, escludendo quelle con oauth_access_token
- Sync IMAP ora esclude cartelle non-email — Calendario, Contatti, Attività, Bozze, Spam, Posta eliminata, Sync Issues; elimina le notifiche "Retrieval using the IMAP4 protocol failed" generate da Exchange


## [0.0.83] - 2026-05-29
### Fixed
- Sync IMAP ora esclude cartelle non-email — Calendario, Contatti, Attività, Bozze, Spam, Posta eliminata, Sync Issues; eliminava le notifiche "Retrieval using the IMAP4 protocol failed" generate da Exchange su elementi non-email


## [0.0.82] - 2026-05-28
### Fixed
- Preview email mostrava "false" nel pannello di anteprima — body_html salvato come stringa "false" invece di NULL quando il parser non trova HTML; aggiunto sanity check prima di restituire il contenuto


## [0.0.81] - 2026-05-28
### Fixed
- OAuth Microsoft: authorization code usabile una sola volta — eliminata doppia chiamata token, email e nome ora letti dall id_token JWT incluso nella risposta
- OAuth Microsoft: aggiunto scope openid, email, profile per garantire la presenza dell id_token
- OAuth Microsoft: rimosso User.Read dagli scope (non necessario con id_token)


## [0.0.80] - 2026-05-28
### Fixed
- OAuth Microsoft: email non trovata per account business/guest con UPN nel formato user_domain.com#EXT#@tenant.onmicrosoft.com — aggiunta ricostruzione email dal formato UPN esteso
- OAuth Microsoft: aggiunto log msUser fields per debug futuro


## [0.0.79] - 2026-05-28
### Fixed
- OAuth callback faceva redirect a /gestione che non esiste in React — corretto in /admin per Microsoft e Google


## [0.0.78] - 2026-05-28
### Added
- Badge OAuth nella lista caselle — mostra logo Microsoft 365 o Google per caselle collegate via OAuth
- Badge "Token in scadenza" in arancione se il refresh token scade entro 7 giorni
- Toast notifica al ritorno dal callback OAuth — verde su successo, rosso su errore, sparisce dopo 5/8s

### Fixed
- Gestione ritorno callback OAuth — query param oauth_success/oauth_error ora letti e puliti dall URL
- admin.js GET /mailboxes — aggiunto oauth_provider e oauth_refresh_expires_at alla SELECT


## [0.0.78] - 2026-05-28
### Added
- Badge OAuth nella lista caselle — mostra logo Microsoft 365 o Google per caselle collegate via OAuth
- Badge "Token in scadenza" in arancione se il refresh token scade entro 7 giorni
- Toast notifica al ritorno dal callback OAuth — verde su successo, rosso su errore, sparisce dopo 5/8s

### Fixed
- Gestione ritorno callback OAuth — query param oauth_success/oauth_error ora letti e puliti dall URL
- admin.js GET /mailboxes — aggiunto oauth_provider e oauth_refresh_expires_at alla SELECT


## [0.0.77] - 2026-05-28
### Fixed
- CORS bloccava il login su produzione — APP_URL mancava nella sezione environment di docker-compose.yml, la variabile non veniva passata al container


## [0.0.77] - 2026-05-28
### Fixed
- CORS bloccava il login su produzione — APP_URL mancava nella sezione environment di docker-compose.yml

## [0.0.76] - 2026-05-27
### Fixed
- Avatar sidebar non si aggiornava senza logout/login — refreshAvatar definita due volte in AuthContext.jsx, useUserAvatar in Layout.jsx faceva fetch una sola volta al mount
- refreshAvatar ora unico useCallback che aggiorna state e localStorage; Layout legge user.avatar_url da AuthContext e chiama refreshAvatar() ad ogni cambio pathname
- multer istanziato a ogni request POST /avatar — spostato al top-level del modulo


## [0.0.77] - 2026-05-28
### Fixed
- CORS bloccava il login su produzione — APP_URL non veniva passato al container perché mancava nella sezione environment di docker-compose.yml

## [0.0.76] - 2026-05-27
### Fixed
- Avatar sidebar non si aggiornava senza logout/login — `refreshAvatar` era definita due volte in `AuthContext.jsx` (una dentro `useEffect` non esposta, una fuori) e `useUserAvatar` in `Layout.jsx` faceva fetch una sola volta al mount con dipendenza `[]`
- `refreshAvatar` è ora un singolo `useCallback` che aggiorna sia lo state React sia `localStorage`; `Layout.jsx` legge `user.avatar_url` direttamente da `AuthContext` e chiama `refreshAvatar()` ad ogni cambio di pathname
- `multer` istanziato a ogni request `POST /avatar` — `require('multer')` e `multer.diskStorage()` erano dentro la route handler; spostati al top-level del modulo

## [0.0.75] - 2026-05-26
### Added
- User Profile — nuova pagina /profile con avatar, nome, telefono, timezone, lingua
- Avatar upload — carica foto profilo JPG/PNG/WEBP max 2MB con validazione
- Avatar predefiniti — 8 avatar SVG geometrici con pattern e icone selezionabili
- Avatar picker — click sull'avatar apre il selettore con preset e upload
- Sessioni attive — lista sessioni con IP, browser, pulsante termina sessione
- Key Rotation — rotazione chiave AES-256 con conferma password (solo superadmin)
- Route PUT /auth/profile — aggiorna nome, telefono, timezone, lingua
- Route POST /auth/avatar — upload immagine profilo con multer
- Route PUT /auth/avatar/preset — selezione avatar predefinito
- Route DELETE /auth/avatar — rimozione avatar
- Route GET /auth/sessions — lista sessioni attive
- Route DELETE /auth/sessions/:id — termina sessione specifica
- Route POST /admin/key-rotation — rotazione chiave con re-cifratura password IMAP
- Tabella user_sessions — traccia sessioni attive con jti, ip, device_info
- Tabella key_rotation_log — storico rotazioni chiave
- Layout — click sull'avatar/nome in basso apre pagina profilo

### Fixed
- auth.js GET /me — ora include timezone, language, phone, avatar_url
- migrate.js — aggiunge colonne timezone, language, phone, avatar_url agli utenti esistenti

### Changed
- index.js — aggiunta route statica /uploads e /avatars per servire file profilo
- Login salva sessione in user_sessions al momento dell'accesso
