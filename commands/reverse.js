// .reverse — recherche d'image inversée (trouve des images similaires)
// ⚠️ Nom partagé : si tu utilises aussi .audioreverse pour inverser un son,
// pas de conflit — ce sont deux commandes différentes.
const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { KEITH_BASE } = require('../config/apis');

function resolveJid(msg) {
  const jid = msg.key.remoteJid;
  return jid.endsWith('@lid') && msg.key.remoteJidAlt ? msg.key.remoteJidAlt : jid;
}

module.exports = {
  name: 'reverse',
  aliases: ['similarimage', 'reverseimage', 'findimage'],
  description: 'Recherche d\'image inversée : trouve des images similaires. Réponds à une image avec .reverse',
  execute: async (sock, msg) => {
    const jid = resolveJid(msg);
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    if (!quoted?.imageMessage) {
      await sock.sendMessage(jid, { text: '📌 Réponds à une image avec `.reverse`' }, { quoted: msg });
      return;
    }
    const wait = await sock.sendMessage(jid, { text: '🔎 Recherche d\'images similaires...' }, { quoted: msg });
    try {
      const buffer = await downloadMediaMessage(
        { message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant || msg.key.participant } },
        'buffer',
        {}
      );
      if (!buffer) {
        await sock.sendMessage(jid, { text: '❌ Échec du traitement du média.', edit: wait.key }, { quoted: msg });
        return;
      }
      const form = new FormData();
      form.append('files[]', buffer, `search_${Date.now()}.jpg`);
      const upload = await axios.post('https://uguu.se/upload.php', form, { headers: form.getHeaders(), timeout: 30000 });
      const uploadedUrl = upload.data?.files?.[0]?.url;
      if (!uploadedUrl) throw new Error("Échec de l'envoi de l'image.");

      const { data } = await axios.get(`${KEITH_BASE}/search/reverseimage?url=${encodeURIComponent(uploadedUrl)}`, { timeout: 30000 });
      if (!data?.status || !data?.result?.similarImages?.length) {
        await sock.sendMessage(jid, { text: '❌ Aucune image similaire trouvée.', edit: wait.key }, { quoted: msg });
        return;
      }
      await sock.sendMessage(jid, { delete: wait.key }).catch(() => {});
      const results = data.result.similarImages.slice(0, 5);
      for (let i = 0; i < results.length; i++) {
        const thumb = results[i].thumbnailUrl || results[i].url;
        if (!thumb) continue;
        await sock.sendMessage(
          jid,
          { image: { url: thumb }, caption: i === 0 ? `🔍 *Images similaires trouvées*\n📸 ${results.length} résultats` : undefined },
          { quoted: msg }
        );
      }
    } catch (error) {
      console.error('[REVERSE ERROR]', error);
      await sock.sendMessage(jid, { text: `❌ Erreur : ${error.message}`, edit: wait.key }, { quoted: msg });
    }
  },
};
