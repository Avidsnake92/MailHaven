// MailHaven — archiviazione automatica della posta inviata.
// Alla spedizione (compose.onAfterSend) prende le copie salvate del messaggio,
// ne scarica il sorgente RFC822 e lo manda al server MailHaven, che lo archivia
// nella casella corrispondente al mittente (dedup via Message-ID lato server).
// Usa lo stesso login del popup (storage: token + baseUrl): se l'utente non è
// collegato non fa nulla. Disattivabile con storage.sentArchive = false.

async function archiveSentMessages(sendInfo) {
  try {
    const { token, baseUrl, sentArchive } =
      await browser.storage.local.get(['token', 'baseUrl', 'sentArchive']);
    if (!token || !baseUrl) return;          // non collegato
    if (sentArchive === false) return;       // disattivato esplicitamente

    const messages = (sendInfo && sendInfo.messages) || [];
    for (const m of messages) {
      try {
        const raw = await browser.messages.getRaw(m.id);
        // Nelle versioni vecchie getRaw restituisce una "binary string",
        // nelle nuove un File: gestiamo entrambe.
        const body = typeof raw === 'string'
          ? new Blob([Uint8Array.from(raw, c => c.charCodeAt(0))])
          : raw;
        const resp = await fetch(`${baseUrl}/api/plugin/sent`, {
          method: 'POST',
          headers: { 'x-plugin-token': token, 'Content-Type': 'message/rfc822' },
          body,
        });
        // 409 = già archiviata: va bene così
        if (!resp.ok && resp.status !== 409) {
          console.warn('MailHaven: archiviazione inviata fallita, HTTP', resp.status);
        }
      } catch (e) {
        console.warn('MailHaven: invio copia fallito', e);
      }
    }
  } catch (e) {
    console.warn('MailHaven: archiviazione posta inviata fallita', e);
  }
}

// onAfterSend esiste da Thunderbird 102: sulle versioni precedenti
// l'estensione continua a funzionare senza archiviazione automatica.
if (browser.compose && browser.compose.onAfterSend) {
  browser.compose.onAfterSend.addListener((tab, sendInfo) => {
    archiveSentMessages(sendInfo);
  });
}
