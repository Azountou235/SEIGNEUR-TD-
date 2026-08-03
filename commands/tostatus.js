const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'tostatus',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut publier sur le statut du bot.' }, { quoted: msg });
      return;
    }

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const typedText = args.join(' ');

    try {
      if (quoted?.imageMessage) {
        const buffer = await downloadMediaMessage({ message: { imageMessage: quoted.imageMessage } }, 'buffer', {});
        await sock.sendMessage('status@broadcast', { image: buffer, caption: quoted.imageMessage.caption || typedText || '' });
      } else if (quoted?.videoMessage) {
        const buffer = await downloadMediaMessage({ message: { videoMessage: quoted.videoMessage } }, 'buffer', {});
        await sock.sendMessage('status@broadcast', { video: buffer, caption: quoted.videoMessage.caption || typedText || '' });
      } else if (quoted?.conversation || quoted?.extendedTextMessage?.text) {
        const text = quoted.conversation || quoted.extendedTextMessage.text;
        await sock.sendMessage('status@broadcast', { text });
      } else if (typedText) {
        await sock.sendMessage('status@broadcast', { text: typedText });
      } else {
        await sock.sendMessage(chatJid, { text: '📤 Répondez à un texte/image/vidéo avec *.tostatus*, ou utilisez *.tostatus <texte>*.' }, { quoted: msg });
        return;
      }

      await sock.sendMessage(chatJid, { text: '✅ Publié sur le statut.' }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec de la publication sur le statut : ${e.message}` }, { quoted: msg });
    }
  },
};
