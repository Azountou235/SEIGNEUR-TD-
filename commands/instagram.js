const axios = require('axios');
const { NEXRAY_BASE } = require('../config/apis');

// The NEXRAY instagram endpoint returns `result` as an array of items:
// [{ type: "image"|"video", url, thumbnail }, ...]
function extractItems(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.result)) return result.result;
  if (result && Array.isArray(result.data)) return result.data;
  if (result && typeof result.data === 'string') return [{ url: result.data, type: 'video' }];
  if (result && typeof result.url === 'string') return [{ url: result.url, type: 'video' }];
  return [];
}

module.exports = {
  name: 'instagram',
  aliases: ['ig'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const url = args[0];

    if (!url || !/^https?:\/\//i.test(url)) {
      await sock.sendMessage(chatJid, {
        text: '📸 Collez un lien Instagram après *.instagram*.\n\nExemple : .instagram https://www.instagram.com/reel/xxxx/',
      }, { quoted: msg });
      return;
    }

    try {
      const { data } = await axios.get(`${NEXRAY_BASE}/downloader/instagram`, { params: { url } });

      if (!data.status) {
        await sock.sendMessage(chatJid, { text: '❌ Impossible de récupérer ce contenu Instagram (lien invalide, privé, ou identifiants requis).' }, { quoted: msg });
        return;
      }

      const items = extractItems(data.result);
      if (!items.length) {
        await sock.sendMessage(chatJid, {
          text: `⚠️ L'API a répondu mais je ne trouve pas le lien du média. Champs reçus : ${Object.keys(data.result || {}).join(', ')}\nDis-moi ce format et je corrige.`,
        }, { quoted: msg });
        return;
      }

      for (const item of items.slice(0, 10)) {
        const mediaUrl = item.url || item.hd || item.sd;
        if (!mediaUrl) continue;
        const isVideo = item.type === 'video' || data.result?.isVideo || /\.mp4($|\?)/i.test(mediaUrl);
        const buffer = (await axios.get(mediaUrl, { responseType: 'arraybuffer' })).data;
        await sock.sendMessage(chatJid, isVideo ? { video: buffer } : { image: buffer }, { quoted: msg });
      }
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
