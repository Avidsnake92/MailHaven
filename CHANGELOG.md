# Changelog

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
