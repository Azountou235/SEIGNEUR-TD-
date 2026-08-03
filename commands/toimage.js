const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');

module.exports = {
  name: 'toimage',
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const stickerMessage = quoted?.stickerMessage || msg.message?.stickerMessage;

    if (!stickerMessage) {
      await sock.sendMessage(chatJid, { text: '🌀 Répondez à un sticker avec *.toimage* pour le convertir en image.' }, { quoted: msg });
      return;
    }

    try {
      const buffer = await downloadMediaMessage({ message: { stickerMessage } }, 'buffer', {});
      const pngBuffer = await sharp(buffer).png().toBuffer();
      await sock.sendMessage(chatJid, { image: pngBuffer }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec de la conversion : ${e.message}` }, { quoted: msg });
    }
  },
};
