// .remini — améliore la qualité d'une image avec l'IA (réponds à une image)
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const os = require('os');
const path = require('path');

async function uploadToUguu(filePath) {
  const form = new FormData();
  form.append('files[]', fs.createReadStream(filePath));
  const { data } = await axios.post('https://uguu.se/upload', form, { headers: form.getHeaders(), timeout: 30000 });
  if (data?.success && data.files?.[0]?.url) return data.files[0].url;
  throw new Error("Échec de l'envoi de l'image.");
}

module.exports = {
  name: 'remini',
  aliases: ['enhance', 'hd'],
  description: "Améliore la qualité d'une image citée avec l'IA. Réponds à une image avec .remini",
  execute: async (sock, msg) => {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    if (!quoted?.imageMessage) {
      await sock.sendMessage(jid, { text: '📌 Réponds à une image avec *.remini* pour l\'améliorer.' }, { quoted: msg });
      return;
    }
    let tmpFile;
    try {
      await sock.sendMessage(jid, { text: '⏳ Amélioration de ton image avec l\'IA... Patiente.' }, { quoted: msg });
      const buffer = await downloadMediaMessage(
        { key: { remoteJid: jid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant }, message: quoted },
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );
      tmpFile = path.join(os.tmpdir(), `remini_${Date.now()}.jpg`);
      fs.writeFileSync(tmpFile, buffer);
      const uploadedUrl = await uploadToUguu(tmpFile);
      const resultUrl = `https://apis.davidcyril.name.ng/remini?url=${encodeURIComponent(uploadedUrl)}`;
      await sock.sendMessage(jid, { image: { url: resultUrl }, mimetype: 'image/png', caption: '✨ *Image améliorée en HD*' }, { quoted: msg });
    } catch (error) {
      console.error('[REMINI ERROR]', error);
      await sock.sendMessage(jid, { text: "❌ Échec de l'amélioration. Vérifie que tu as bien répondu à une photo nette et réessaie." }, { quoted: msg });
    } finally {
      if (tmpFile && fs.existsSync(tmpFile)) { try { fs.unlinkSync(tmpFile); } catch {} }
    }
  },
};
