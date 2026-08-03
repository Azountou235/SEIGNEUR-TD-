const axios = require('axios');
const { NEXRAY_BASE } = require('../config/apis');

function extractMediaUrl(result) {
  if (!result) return null;
  return result.data || result.url || result.link || result.download_url || null;
}

module.exports = {
  name: 'mediafire',
  aliases: ['mf'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const url = args[0];

    if (!url || !/^https?:\/\//i.test(url)) {
      await sock.sendMessage(chatJid, {
        text: '📁 Collez un lien Mediafire après *.mediafire*.\n\nExemple : .mediafire https://www.mediafire.com/file/xxxx/',
      }, { quoted: msg });
      return;
    }

    try {
      const { data } = await axios.get(`${NEXRAY_BASE}/downloader/mediafire`, { params: { url } });

      if (!data.status) {
        await sock.sendMessage(chatJid, { text: '❌ Impossible de récupérer ce fichier Mediafire (lien invalide ou expiré).' }, { quoted: msg });
        return;
      }

      const mediaUrl = extractMediaUrl(data.result);
      if (!mediaUrl) {
        await sock.sendMessage(chatJid, {
          text: `⚠️ L'API a répondu mais je ne trouve pas le lien du fichier. Champs reçus : ${Object.keys(data.result || {}).join(', ')}\nDis-moi ce format et je corrige.`,
        }, { quoted: msg });
        return;
      }

      const fileName = data.result?.filename || data.result?.name || 'fichier';
      const buffer = (await axios.get(mediaUrl, { responseType: 'arraybuffer' })).data;
      await sock.sendMessage(chatJid, { document: buffer, fileName, mimetype: 'application/octet-stream' }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
