const axios = require('axios');
const { NEXRAY_BASE } = require('../config/apis');

module.exports = {
  name: 'tiktok',
  aliases: ['tt'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const url = args[0];

    if (!url || !/^https?:\/\//i.test(url)) {
      await sock.sendMessage(chatJid, {
        text: '🎵 Collez un lien TikTok après *.tiktok*.\n\nExemple : .tiktok https://vt.tiktok.com/xxxxx/',
      }, { quoted: msg });
      return;
    }

    try {
      const { data } = await axios.get(`${NEXRAY_BASE}/downloader/tiktok`, { params: { url } });

      if (!data.status || !data.result?.data) {
        await sock.sendMessage(chatJid, { text: '❌ Impossible de récupérer cette vidéo TikTok (lien invalide ou vidéo privée).' }, { quoted: msg });
        return;
      }

      const { title, author, data: videoUrl, stats } = data.result;
      const caption = `🎵 *TikTok*\n👤 ${author?.nickname || 'Inconnu'}${title && title !== '-' ? `\n📝 ${title}` : ''}${stats ? `\n❤️ ${stats.likes} · 💬 ${stats.comment} · 🔁 ${stats.share}` : ''}`;

      const videoBuffer = (await axios.get(videoUrl, { responseType: 'arraybuffer' })).data;
      await sock.sendMessage(chatJid, { video: videoBuffer, caption }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
