// .audio — recherche et télécharge l'audio d'une vidéo YouTube
const axios = require('axios');
const { KEITH_BASE } = require('../config/apis');

module.exports = {
  name: 'audio',
  description: "Cherche et télécharge l'audio d'une vidéo YouTube. Usage : .audio <titre ou lien>",
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const query = args.join(' ').trim();
    if (!query) {
      await sock.sendMessage(jid, { text: '🎵 *AUDIO*\n\nExemple :\n.audio Shape of You' }, { quoted: msg });
      return;
    }
    let wait;
    try {
      wait = await sock.sendMessage(jid, { text: '🔍 Recherche en cours...' }, { quoted: msg });
      let videoUrl, title;
      if (/youtu\.be|youtube\.com/i.test(query)) {
        videoUrl = query;
        title = 'Audio YouTube';
      } else {
        const { data } = await axios.get(`${KEITH_BASE}/search/yts?query=${encodeURIComponent(query)}`);
        const results = data?.result;
        if (!Array.isArray(results) || results.length === 0) {
          await sock.sendMessage(jid, { text: '❌ Aucun résultat trouvé.', edit: wait.key });
          return;
        }
        videoUrl = results[0].url;
        title = results[0].title;
      }
      await sock.sendMessage(jid, { text: `🎧 Téléchargement...\n\n*${title}*`, edit: wait.key });
      const { data: dl } = await axios.get(`${KEITH_BASE}/download/audio?url=${encodeURIComponent(videoUrl)}`);
      const audioUrl = dl?.result;
      if (!audioUrl) throw new Error("Impossible de récupérer l'audio.");
      const fileName = (title + '.mp3').replace(/[\\/:*?"<>|]/g, '');
      await sock.sendMessage(jid, { audio: { url: audioUrl }, mimetype: 'audio/mpeg', fileName, ptt: false }, { quoted: msg });
      await sock.sendMessage(jid, { text: `✅ Téléchargé avec succès\n\n🎵 *${title}*`, edit: wait.key });
    } catch (error) {
      console.error('[AUDIO ERROR]', error);
      const text = `❌ Échec du téléchargement audio.\n\n${error.message}`;
      if (wait) await sock.sendMessage(jid, { text, edit: wait.key });
      else await sock.sendMessage(jid, { text }, { quoted: msg });
    }
  },
};
