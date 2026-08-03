const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'tosgroup',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!chatJid.endsWith('@g.us')) {
      await sock.sendMessage(chatJid, { text: '⚠️ Cette commande ne fonctionne que dans un groupe.' }, { quoted: msg });
      return;
    }

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted) {
      await sock.sendMessage(chatJid, {
        text: '📤 Répondez à une photo, vidéo, audio ou message vocal avec *.tosgroup* pour le republier dans le groupe.',
      }, { quoted: msg });
      return;
    }

    try {
      if (quoted.imageMessage) {
        const buffer = await downloadMediaMessage({ message: { imageMessage: quoted.imageMessage } }, 'buffer', {});
        await sock.sendMessage(chatJid, { image: buffer, caption: quoted.imageMessage.caption || '' });
      } else if (quoted.videoMessage) {
        const buffer = await downloadMediaMessage({ message: { videoMessage: quoted.videoMessage } }, 'buffer', {});
        await sock.sendMessage(chatJid, { video: buffer, caption: quoted.videoMessage.caption || '' });
      } else if (quoted.audioMessage) {
        const buffer = await downloadMediaMessage({ message: { audioMessage: quoted.audioMessage } }, 'buffer', {});
        await sock.sendMessage(chatJid, {
          audio: buffer,
          ptt: !!quoted.audioMessage.ptt,
          mimetype: quoted.audioMessage.mimetype || 'audio/ogg; codecs=opus',
        });
      } else {
        await sock.sendMessage(chatJid, {
          text: '⚠️ Le message cité doit être une photo, une vidéo, un audio ou un vocal.',
        }, { quoted: msg });
        return;
      }
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec de la republication : ${e.message}` }, { quoted: msg });
    }
  },
};
