const crypto = require('crypto');

// Controlla hash file su VirusTotal (tier gratuito: 4 req/min, 500/giorno)
const checkHash = async (buffer, filename) => {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) return { clean: true, skipped: true, reason: 'API key non configurata' };

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  try {
    const res = await fetch('https://www.virustotal.com/api/v3/files/' + hash, {
      headers: { 'x-apikey': apiKey, 'Accept': 'application/json' }
    });

    if (res.status === 404) {
      return { clean: true, unknown: true, hash, filename, source: 'VirusTotal' };
    }

    if (res.status === 429) {
      console.warn('[VirusTotal] Rate limit raggiunto');
      return { clean: true, skipped: true, reason: 'Rate limit', hash };
    }

    if (!res.ok) return { clean: true, skipped: true, reason: 'API error ' + res.status };

    const data = await res.json();
    const stats = data.data?.attributes?.last_analysis_stats || {};
    const malicious = (stats.malicious || 0) + (stats.suspicious || 0);
    const total = Object.values(stats).reduce((a, b) => a + b, 0);

    if (malicious > 0) {
      const results = data.data?.attributes?.last_analysis_results || {};
      const detections = Object.entries(results)
        .filter(([, r]) => r.category === 'malicious' || r.category === 'suspicious')
        .map(([engine, r]) => engine + ':' + r.result)
        .slice(0, 5);
      return {
        clean: false,
        infected: true,
        viruses: detections,
        hash,
        filename,
        source: 'VirusTotal',
        detections: malicious + '/' + total,
      };
    }

    return { clean: true, hash, filename, source: 'VirusTotal', detections: '0/' + total };
  } catch(e) {
    console.error('[VirusTotal] Errore:', e.message);
    return { clean: true, skipped: true, reason: e.message };
  }
};

// Rate limiter: max 4 req/min
let lastRequests = [];
const rateLimitedCheck = async (buffer, filename) => {
  const now = Date.now();
  lastRequests = lastRequests.filter(t => now - t < 60000);
  if (lastRequests.length >= 4) {
    const wait = 60000 - (now - lastRequests[0]) + 100;
    await new Promise(r => setTimeout(r, wait));
    return rateLimitedCheck(buffer, filename);
  }
  lastRequests.push(now);
  return checkHash(buffer, filename);
};

module.exports = { checkHash: rateLimitedCheck };
