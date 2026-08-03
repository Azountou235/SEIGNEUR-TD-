const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'viewonce',
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut utiliser cette commande.' }, { quoted: msg });
      return;
    }
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    const image = msg.message?.imageMessage || quoted?.imageMessage;
    const video = msg.message?.videoMessage || quoted?.videoMessage;
    const audio = msg.message?.audioMessage || quoted?.audioMessage;
    const media = image || video || audio;

    if (!media) {
      await sock.sendMessage(chatJid, { text: '📸 Répondez à une image, une vidéo ou un vocal avec *.viewonce* pour le renvoyer en vue unique.' }, { quoted: msg });
      return;
    }

    try {
      const type = image ? 'image' : video ? 'video' : 'audio';
      const wrapped = { message: { [`${type}Message`]: media } };
      const buffer = await downloadMediaMessage(wrapped, 'buffer', {});

      if (type === 'image') {
        await sock.sendMessage(chatJid, { image: buffer, viewOnce: true }, { quoted: msg });
      } else if (type === 'video') {
        await sock.sendMessage(chatJid, { video: buffer, viewOnce: true }, { quoted: msg });
      } else {
        await sock.sendMessage(chatJid, { audio: buffer, mimetype: media.mimetype || 'audio/ogg; codecs=opus', ptt: true, viewOnce: true }, { quoted: msg });
      }
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
