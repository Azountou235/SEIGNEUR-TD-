// .vision — analyse une image avec l'IA (réponds à une image + pose une question)
const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { KEITH_BASE } = require('../config/apis');

function resolveJid(msg) {
  const jid = msg.key.remoteJid;
  return jid.endsWith('@lid') && msg.key.remoteJidAlt ? msg.key.remoteJidAlt : jid;
}

async function uploadToUguu(buffer, filename) {
  const form = new FormData();
  form.append('files[]', buffer, { filename, contentType: 'image/jpeg' });
  const { data } = await axios.post('https://uguu.se/upload.php', form, {
    headers: { ...form.getHeaders(), origin: 'https://uguu.se', referer: 'https://uguu.se/' },
    timeout: 30000,
  });
  if (data?.success && data?.files?.[0]?.url) return data.files[0].url;
  throw new Error('Échec de l\'envoi du média');
}

module.exports = {
  name: 'vision',
  aliases: ['imgai', 'analyze'],
  description: "Analyse une image avec l'IA. Réponds à une image avec .vision <question>",
  execute: async (sock, msg, args) => {
    const jid = resolveJid(msg);
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const question = args.join(' ').trim();
    if (!quoted?.imageMessage) {
      await sock.sendMessage(jid, { text: '📌 Réponds à une image avec une question.\nExemple : *.vision qu\'est-ce que c\'est ?*' }, { quoted: msg });
      return;
    }
    if (!question) {
      await sock.sendMessage(jid, { text: "❌ Pose une question sur l'image !\nExemple : *.vision que vois-tu sur cette image ?*" }, { quoted: msg });
      return;
    }
    const wait = await sock.sendMessage(jid, { text: "👁️ *Analyse de ton image...*" }, { quoted: msg });
    try {
      const buffer = await downloadMediaMessage(
        { key: { remoteJid: jid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant }, message: quoted },
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );
      const uploadedUrl = await uploadToUguu(buffer, 'image.jpg');
      const { data } = await axios.get(`${KEITH_BASE}/ai/vision?image=${encodeURIComponent(uploadedUrl)}&q=${encodeURIComponent(question)}`, { timeout: 120000 });
      if (!data?.status || !data?.result) {
        await sock.sendMessage(jid, { text: "❌ Pas de réponse de l'IA. Réessaie.", edit: wait.key }, { quoted: msg });
        return;
      }
      const answer = typeof data.result === 'string' ? data.result : data.result.response || data.result.text || JSON.stringify(data.result);
      await sock.sendMessage(jid, { text: `👁️ *Analyse*\n\n${answer}`, edit: wait.key }, { quoted: msg });
    } catch (error) {
      console.error('[VISION ERROR]', error);
      await sock.sendMessage(jid, { text: `❌ Échec de l'analyse : ${error.message}`, edit: wait.key }, { quoted: msg });
    }
  },
};
