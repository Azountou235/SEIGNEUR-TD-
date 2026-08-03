const axios = require('axios');
const yts = require('yt-search');
const { NEXRAY_BASE } = require('../config/apis');

module.exports = {
  name: 'ytmp3',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const query = args.join(' ');

    if (!query) {
      await sock.sendMessage(chatJid, { text: '🎵 Écrivez le nom de la musique (ou collez un lien YouTube) après *.ytmp3*.' }, { quoted: msg });
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

      const { data } = await axios.get(`${NEXRAY_BASE}/downloader/ytmp3`, { params: { url } });

      if (!data.status || !data.result?.url) {
        await sock.sendMessage(chatJid, { text: '❌ Impossible de récupérer cette musique YouTube.' }, { quoted: msg });
        return;
      }

      const { title, author, url: audioUrl } = data.result;
      const buffer = (await axios.get(audioUrl, { responseType: 'arraybuffer' })).data;
      await sock.sendMessage(chatJid, {
        audio: buffer,
        mimetype: 'audio/mpeg',
        fileName: `${title || 'audio'}.mp3`,
      }, { quoted: msg });
      await sock.sendMessage(chatJid, { text: `🎵 *${title || 'YouTube'}*${author ? `\n👤 ${author}` : ''}` }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
