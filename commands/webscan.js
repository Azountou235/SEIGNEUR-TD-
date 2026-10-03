// .webscan — infos basiques sur un site (statut, serveur, type de contenu, temps de réponse)
const https = require('https');
const http = require('http');
const { URL } = require('url');

function scanSite(target) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(target); } catch { return reject(new Error('URL invalide')); }
    const lib = url.protocol === 'https:' ? https : http;
    const started = Date.now();
    const req = lib.request({ hostname: url.hostname, path: url.pathname || '/', method: 'GET', timeout: 10000 }, (res) => {
      const responseTime = Date.now() - started;
      res.resume();
      resolve({
        url: target,
        status: res.statusCode,
        statusMessage: res.statusMessage,
        server: res.headers['server'] || 'Inconnu',
        contentType: res.headers['content-type'] || 'Inconnu',
        poweredBy: res.headers['x-powered-by'] || 'Non communiqué',
        responseTime,
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Délai dépassé')); });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

module.exports = {
  name: 'webscan',
  description: 'Analyse un site web et donne des infos de base. Usage : .webscan https://google.com',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    let url = args.join(' ').trim();
    if (!url) {
      await sock.sendMessage(jid, { text: '❌ Donne un lien\nEx : .webscan https://google.com' }, { quoted: msg });
      return;
    }
    if (!url.startsWith('http')) url = `https://${url}`;
    await sock.sendMessage(jid, { text: '🔍 Analyse du site en cours...' }, { quoted: msg });
    try {
      const info = await scanSite(url);
      const text = (
        `\n╭──〔 🌐 ANALYSE DU SITE 〕──╮\n` +
        `🔗 *URL :* ${info.url}\n` +
        `📊 *Statut :* ${info.status} ${info.statusMessage}\n` +
        `🖥 *Serveur :* ${info.server}\n` +
        `⚙️ *Techno :* ${info.poweredBy}\n` +
        `📄 *Type :* ${info.contentType}\n` +
        `⏱ *Temps de réponse :* ${info.responseTime}ms\n` +
        `╰──────────────────╯`
      ).trim();
      await sock.sendMessage(jid, { text }, { quoted: msg });
    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ Analyse échouée : ${error.message}` }, { quoted: msg });
    }
  },
};
