// .video — téléchargement d'une vidéo YouTube (MP4, limité à 100 Mo)
const axios = require('axios');
const { KEITH_BASE } = require('../config/apis');

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} a dépassé ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function reasonFor(error) {
  if (error.response?.status === 429) return 'limite de requêtes atteinte';
  if (error.response?.status) return `HTTP ${error.response.status}`;
  if (error.code === 'ECONNABORTED') return 'délai dépassé';
  return error.message;
}

module.exports = {
  name: 'video',
  aliases: ['ytv', 'ytmp4'],
  description: 'Télécharge une vidéo YouTube (MP4). Usage : .video <titre ou lien>',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const query = args.join(' ').trim();
    if (!query) {
      await sock.sendMessage(jid, { text: '🎬 Indique un titre ou un lien YouTube !\nEx : `.video Blinding Lights`' }, { quoted: msg });
      return;
    }
    let wait;
    try {
      wait = await sock.sendMessage(jid, { text: `🔍 Recherche *${query}*...` }, { quoted: msg });
    } catch (error) {
      console.error('[VIDEO] Échec du message initial :', error.message);
      return;
    }
    let videoUrl, title;
    try {
      if (/(youtube\.com|youtu\.be)/i.test(query)) {
        videoUrl = query;
        title = 'Vidéo YouTube';
      } else {
        const { data } = await axios.get(`${KEITH_BASE}/search/yts?query=${encodeURIComponent(query)}`, { timeout: 20000 });
        const results = data?.result;
        if (!Array.isArray(results) || results.length === 0) {
          await sock.sendMessage(jid, { text: `❌ Aucun résultat pour : *${query}*`, edit: wait.key });
          return;
        }
        videoUrl = results[0].url;
        title = results[0].title;
      }
    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ Recherche échouée : ${reasonFor(error)}`, edit: wait.key });
      return;
    }
    await sock.sendMessage(jid, { text: `😍 Trouvé : *${title}*\n⏳ Résolution du lien de téléchargement...`, edit: wait.key });
    let downloadUrl;
    try {
      const { data } = await axios.get(`${KEITH_BASE}/download/mp4?url=${encodeURIComponent(videoUrl)}`, { timeout: 60000 });
      downloadUrl = typeof data?.result === 'string' ? data.result : null;
      if (!downloadUrl) throw new Error(typeof data?.result === 'string' ? data.result : 'aucun lien vidéo valide');
    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ Téléchargement impossible : ${reasonFor(error)}`, edit: wait.key });
      return;
    }
    const head = await axios.head(downloadUrl, { timeout: 15000 }).catch(() => null);
    const size = head?.headers?.['content-length'];
    if (size && parseInt(size) > 100 * 1024 * 1024) {
      await sock.sendMessage(jid, { text: `❌ Vidéo trop volumineuse (${(parseInt(size) / (1024 * 1024)).toFixed(1)} Mo). Limite : 100 Mo.`, edit: wait.key });
      return;
    }
    const fileName = title.replace(/[\\/:*?"<>|]/g, '').trim() + '.mp4';
    await sock.sendMessage(jid, { text: `✅ Envoi en cours : *${title}*`, edit: wait.key });
    try {
      await withTimeout(
        sock.sendMessage(jid, { video: { url: downloadUrl }, mimetype: 'video/mp4', fileName, caption: `🎬 *${title}*` }, { quoted: msg }),
        90000,
        "Envoi de la vidéo"
      );
      await sock.sendMessage(jid, { text: `✅ *${title}* envoyée avec succès`, edit: wait.key });
    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ Envoi échoué : ${error.message}`, edit: wait.key });
    }
  },
};
