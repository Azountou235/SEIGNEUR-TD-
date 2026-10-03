// .play2 — téléchargement audio via une API alternative (secours si .audio échoue)
const axios = require('axios');
const { KEITH_BASE } = require('../config/apis');

module.exports = {
  name: 'play2',
  aliases: ['yta2'],
  description: "Télécharge l'audio YouTube via une API alternative. Usage : .play2 <titre ou lien>",
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const query = args.join(' ').trim();
    if (!query) {
      await sock.sendMessage(jid, { text: '🎧 Indique un titre ou un lien YouTube !\nEx : .play2 Blinding Lights' }, { quoted: msg });
      return;
    }
    try {
      const wait = await sock.sendMessage(jid, { text: `🔍 Recherche de *${query}*...` }, { quoted: msg });
      let videoUrl, title;
      if (/(youtube\.com|youtu\.be)/i.test(query)) {
        videoUrl = query;
        title = 'Audio YouTube';
      } else {
        const { data } = await axios.get(`${KEITH_BASE}/search/yts?query=${encodeURIComponent(query)}`);
        const results = data?.result;
        if (!Array.isArray(results) || results.length === 0) {
          await sock.sendMessage(jid, { text: `❌ Aucun résultat pour : *${query}*`, edit: wait.key });
          return;
        }
        videoUrl = results[0].url;
        title = results[0].title;
      }
      await sock.sendMessage(jid, { text: `😍 Trouvé : *${title}*\n⏳ Téléchargement...`, edit: wait.key });
      const { data: dl } = await axios.get(`https://mcow.giftedtechnexus.workers.dev/api/yta?url=${encodeURIComponent(videoUrl)}`, { timeout: 60000 });
      if (!dl.success || !dl.result?.download_url) {
        await sock.sendMessage(jid, { text: '❌ Échec du téléchargement. Essaie un autre titre.', edit: wait.key });
        return;
      }
      const finalTitle = dl.result.title || title;
      const fileName = finalTitle.replace(/[\\/:*?"<>|]/g, '').trim() + '.mp3';
      await sock.sendMessage(jid, { audio: { url: dl.result.download_url }, mimetype: 'audio/mpeg', fileName }, { quoted: msg });
      await sock.sendMessage(jid, { text: `✅ Téléchargé avec succès ! *${finalTitle}*`, edit: wait.key });
    } catch (error) {
      await sock.sendMessage(jid, { text: "❌ Une erreur s'est produite. Réessaie." }, { quoted: msg });
    }
  },
};
