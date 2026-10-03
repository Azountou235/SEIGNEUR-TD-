// .vocalremover — extrait la voix d'un audio/vidéo (sépare voix et musique)
const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { KEITH_BASE } = require('../config/apis');

function resolveJid(msg) {
  const jid = msg.key.remoteJid;
  return jid.endsWith('@lid') && msg.key.remoteJidAlt ? msg.key.remoteJidAlt : jid;
}

async function uploadToCatbox(buffer, filename) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', buffer, { filename });
  const { data } = await axios.post('https://catbox.moe/user/api.php', form, { headers: form.getHeaders(), timeout: 30000 });
  return data;
}

module.exports = {
  name: 'vocalremover',
  aliases: ['removevocal', 'aivocal', 'extractvocal'],
  description: "Extrait la voix d'un audio ou d'une vidéo citée.",
  execute: async (sock, msg) => {
    const jid = resolveJid(msg);
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const audio = quoted?.audioMessage;
    const video = quoted?.videoMessage;
    if (!audio && !video) {
      await sock.sendMessage(jid, { text: "📌 Réponds à un audio ou une vidéo avec .vocalremover pour extraire la voix." }, { quoted: msg });
      return;
    }
    const wait = await sock.sendMessage(jid, { text: '🎵 *Extraction de la voix...*' }, { quoted: msg });
    try {
      const buffer = await downloadMediaMessage(
        { key: { remoteJid: jid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant }, message: quoted },
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );
      const ext = audio ? 'mp3' : 'mp4';
      const uploaded = await uploadToCatbox(buffer, `media.${ext}`);
      const { data } = await axios.get(`${KEITH_BASE}/ai/vocalremover?url=${encodeURIComponent(uploaded)}`, { timeout: 180000 });
      if (!data?.status || !data?.result?.vocal) throw new Error('Aucune piste vocale trouvée.');
      await sock.sendMessage(jid, { audio: { url: data.result.vocal }, mimetype: 'audio/mp4', ptt: false }, { quoted: msg });
      await sock.sendMessage(jid, { delete: wait.key }).catch(() => {});
    } catch (error) {
      console.error('[VOCALREMOVER ERROR]', error);
      await sock.sendMessage(jid, { text: `❌ Échec de l'extraction : ${error.message}`, edit: wait.key }, { quoted: msg });
    }
  },
};
