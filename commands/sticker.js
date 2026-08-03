const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');

module.exports = {
  name: 'sticker',
  aliases: ['s', 'stiker'],
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    const imageMessage = quoted?.imageMessage || msg.message?.imageMessage;
    const videoMessage = quoted?.videoMessage || msg.message?.videoMessage;

    if (!imageMessage && !videoMessage) {
      await sock.sendMessage(chatJid, {
        text: '🖼️ Répondez à (ou envoyez avec légende) une image ou une courte vidéo/gif avec *.sticker* pour la convertir en sticker.',
      }, { quoted: msg });
      return;
    }

    try {
      const buffer = imageMessage
        ? await downloadMediaMessage({ message: { imageMessage } }, 'buffer', {})
        : await downloadMediaMessage({ message: { videoMessage } }, 'buffer', {});

      const sticker = new Sticker(buffer, {
        pack: 'TOUMAÏ-MD',
        author: 'TOUMAÏ',
        type: StickerTypes.FULL,
        quality: 60,
      });

      const stickerBuffer = await sticker.toBuffer();
      await sock.sendMessage(chatJid, { sticker: stickerBuffer }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec de la conversion en sticker : ${e.message}` }, { quoted: msg });
    }
  },
};
