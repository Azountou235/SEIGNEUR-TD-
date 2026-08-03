const axios = require('axios');
const { NEXRAY_BASE } = require('../config/apis');

// The NEXRAY facebook endpoint returns `result` as an object:
// { title, views, reaction, video_sd, video_hd, audio }
function extractMediaUrl(result) {
  if (!result) return null;
  return result.video_hd || result.video_sd || result.audio || null;
}

module.exports = {
  name: 'facebook',
  aliases: ['fb'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const url = args[0];

    if (!url || !/^https?:\/\//i.test(url)) {
      await sock.sendMessage(chatJid, {
        text: '📘 Collez un lien Facebook après *.facebook*.\n\nExemple : .facebook https://www.facebook.com/share/v/xxxx/',
      }, { quoted: msg });
      return;
    }

    try {
      const { data } = await axios.get(`${NEXRAY_BASE}/downloader/facebook`, { params: { url } });

      if (!data.status) {
        await sock.sendMessage(chatJid, { text: '❌ Impossible de récupérer cette vidéo Facebook (lien invalide ou privé).' }, { quoted: msg });
        return;
      }

      const mediaUrl = extractMediaUrl(data.result);
      if (!mediaUrl) {
        await sock.sendMessage(chatJid, { text: '❌ Impossible de récupérer cette vidéo Facebook (lien invalide, privé, ou vidéo introuvable).' }, { quoted: msg });
        return;
      }

      const caption = data.result?.title || '📘 Facebook';
      const isAudioOnly = !data.result?.video_hd && !data.result?.video_sd && !!data.result?.audio;
      const buffer = (await axios.get(mediaUrl, { responseType: 'arraybuffer' })).data;
      await sock.sendMessage(
        chatJid,
        isAudioOnly ? { audio: buffer, mimetype: 'audio/mpeg' } : { video: buffer, caption },
        { quoted: msg }
      );
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
