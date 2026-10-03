// .imagesearch — recherche d'images (via l'API Keith déjà utilisée par le bot)
const axios = require('axios');
const { KEITH_BASE } = require('../config/apis');

function resolveJid(msg) {
  const jid = msg.key.remoteJid;
  return jid.endsWith('@lid') && msg.key.remoteJidAlt ? msg.key.remoteJidAlt : jid;
}

module.exports = {
  name: 'imagesearch',
  aliases: ['imgsearch', 'photosearch', 'gis', 'image'],
  description: 'Recherche des images à partir d\'un mot-clé. Usage : .imagesearch <recherche>',
  execute: async (sock, msg, args) => {
    const jid = resolveJid(msg);
    const query = args.join(' ').trim();
    if (!query) {
      await sock.sendMessage(jid, { text: '📌 *Recherche d\'images*\n\n*Usage :* `.imagesearch chien`\n*Alias :* `.imgsearch`, `.photosearch`' }, { quoted: msg });
      return;
    }
    const wait = await sock.sendMessage(jid, { text: `🔍 Recherche de "${query}"...` }, { quoted: msg });
    try {
      const { data } = await axios.get(`${KEITH_BASE}/search/images?query=${encodeURIComponent(query)}`, { timeout: 60000 });
      if (!data?.status || !data?.result?.length) {
        await sock.sendMessage(jid, { text: '❌ Aucune image trouvée.', edit: wait.key }, { quoted: msg });
        return;
      }
      await sock.sendMessage(jid, { delete: wait.key }).catch(() => {});
      const results = data.result.slice(0, 5);
      for (let i = 0; i < results.length; i++) {
        const thumb = results[i].thumbnail || results[i].url;
        if (!thumb) continue;
        await sock.sendMessage(
          jid,
          { image: { url: thumb }, caption: i === 0 ? `🔎 *${query}*\n📸 ${results.length} résultats trouvés` : undefined },
          { quoted: msg }
        );
      }
    } catch (error) {
      console.error('[IMAGESEARCH ERROR]', error);
      await sock.sendMessage(jid, { text: `❌ Erreur : ${error.message}`, edit: wait.key }, { quoted: msg });
    }
  },
};
