const axios = require('axios');
const yts = require('yt-search');
const { NEXRAY_BASE } = require('../config/apis');

module.exports = {
  name: 'ytmp4',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const query = args.join(' ');

    if (!query) {
      await sock.sendMessage(chatJid, { text: '🎬 Écrivez le nom de la vidéo (ou collez un lien YouTube) après *.ytmp4*.' }, { quoted: msg });
      return;
    }

    try {
      let url = query;
      if (!/^https?:\/\//i.test(query)) {
        const search = await yts(query);
        const video = search.videos[0];
        if (!video) {
          await sock.sendMessage(chatJid, { text: '❌ Aucun résultat trouvé.' }, { quoted: msg });
          return;
        }
        url = video.url;
      }

      const { data } = await axios.get(`${NEXRAY_BASE}/downloader/ytmp4`, { params: { url } });

      if (!data.status || !data.result?.url) {
        await sock.sendMessage(chatJid, { text: '❌ Impossible de récupérer cette vidéo YouTube.' }, { quoted: msg });
        return;
      }

      const { title, author, url: videoUrl, format } = data.result;
      if (format && format.toUpperCase() !== 'MP4') {
        await sock.sendMessage(chatJid, {
          text: `⚠️ L'API a renvoyé un format *${format}* au lieu de MP4 pour cette requête — vérifie le nom exact de l'endpoint vidéo côté API, je l'ai peut-être mal deviné (\`/downloader/ytmp4\`).`,
        }, { quoted: msg });
        return;
      }

      const caption = `🎬 *${title || 'YouTube'}*${author ? `\n👤 ${author}` : ''}`;
      const buffer = (await axios.get(videoUrl, { responseType: 'arraybuffer' })).data;
      await sock.sendMessage(chatJid, { video: buffer, caption }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
