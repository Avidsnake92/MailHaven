# MailHaven — server di licenze (revoca a distanza)

Componente **opzionale**. La verifica della licenza in MailHaven è **offline**
(firma Ed25519): questo server serve solo a poter **revocare** a distanza una
chiave o un'installazione. Il client è **fail-open**: se il server è spento o
irraggiungibile, MailHaven continua a funzionare normalmente.

## Avvio

```bash
cd license-server
npm install
ADMIN_TOKEN="un-token-lungo-e-segreto" PORT=4999 npm start
```

Oppure con Docker / PM2 / systemd a piacere. Esponilo su un indirizzo
raggiungibile dalle installazioni dei clienti (es. https://licenze.tuodominio.it).

## Collegare le installazioni MailHaven

In ogni MailHaven: **Impostazioni → Licenza → Verifica online**, imposta l'URL
del server (es. `https://licenze.tuodominio.it`). Da quel momento l'istanza
sincronizza ogni 6 ore (e si può forzare con "Sincronizza ora").

## Revocare una licenza

Il modo più semplice è per **ID installazione** (il cliente lo vede nel suo
pannello, oppure lo trovi nei log del server):

```bash
node revoke.js add --install <ID-INSTALLAZIONE> --reason "mancato pagamento"
node revoke.js list
node revoke.js remove --install <ID-INSTALLAZIONE>   # ripristina
```

In alternativa per **keyId** (lo stampa la CLI `mailhaven-license` al momento
dell'emissione):

```bash
node revoke.js add --keyId <KEYID>
```

Alla successiva sincronizzazione (o forzandola dal pannello) l'istanza revocata
torna automaticamente all'edizione **Community** — i dati restano e la posta non
si ferma, si disattivano solo le funzioni Pro.

## API

- `POST /verify` `{ installId, keyId, edition }` → `{ revoked: bool }` (pubblico)
- `GET  /admin/revoked` (header `x-admin-token`)
- `POST /admin/revoke`  `{ keyId?, installId?, reason? }`
- `POST /admin/restore` `{ keyId?, installId? }`
- `GET  /health`
