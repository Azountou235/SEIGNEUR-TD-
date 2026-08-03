const axios = require('axios');
const { NEXRAY_BASE } = require('../config/apis');

function extractMediaUrl(result) {
  if (!result) return null;
  return result.data || result.url || result.link || result.download_url || null;
}

module.exports = {
  name: 'apk',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const query = args.join(' ');

    if (!query) {
      await sock.sendMessage(chatJid, {
        text: "📱 Écrivez le nom de l'application après *.apk*.\n\nExemple : .apk WhatsApp",
      }, { quoted: msg });
      return;
    }

    try {
      const { data } = await axios.get(`${NEXRAY_BASE}/downloader/apk`, { params: { url: query, q: query } });

      if (!data.status) {
        await sock.sendMessage(chatJid, { text: "❌ Application introuvable." }, { quoted: msg });
        return;
      }

      const mediaUrl = extractMediaUrl(data.result);
      if (!mediaUrl) {
        await sock.sendMessage(chatJid, {
          text: `⚠️ L'API a répondu mais je ne trouve pas le lien de l'apk. Champs reçus : ${Object.keys(data.result || {}).join(', ')}\nDis-moi ce format et je corrige.`,
        }, { quoted: msg });
        return;
      }

      const name = data.result?.name || data.result?.title || query;
      const buffer = (await axios.get(mediaUrl, { responseType: 'arraybuffer' })).data;
      await sock.sendMessage(chatJid, { document: buffer, fileName: `${name}.apk`, mimetype: 'application/vnd.android.package-archive' }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
