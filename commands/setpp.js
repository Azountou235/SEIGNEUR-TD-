const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'setpp',
  aliases: ['setprofilepic'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer la photo de profil du bot.' }, { quoted: msg });
      return;
    }

    const quotedImage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
    const directImage = msg.message?.imageMessage;

    const imageMessage = quotedImage || directImage;

    if (!imageMessage) {
      await sock.sendMessage(chatJid, { text: '📸 Répondez à une image (ou envoyez-en une avec légende) avec *.setpp* pour la définir comme photo de profil du bot.' }, { quoted: msg });
      return;
    }

    try {
      const buffer = await downloadMediaMessage({ message: { imageMessage } }, 'buffer', {});
      await sock.updateProfilePicture(sock.user.id, buffer);
      await sock.sendMessage(chatJid, { text: '✅ Photo de profil mise à jour.' }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec de la mise à jour de la photo de profil : ${e.message}` }, { quoted: msg });
    }
  },
};
