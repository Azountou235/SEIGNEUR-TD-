const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const viewOnceCache = require('../utils/viewOnceCache');

module.exports = {
  name: 'adjib',
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const stanzaId = ctx?.stanzaId;

    if (!quoted && !stanzaId) {
      await sock.sendMessage(chatJid, {
        text: '👁️ *VUE UNIQUE*\n\n💡 Réponds à un message *vue unique* avec *.adjib* pour l\'ouvrir dans le chat.\n\n_Ou réponds avec n\'importe quel texte/emoji pour recevoir le média en privé du bot._',
      }, { quoted: msg });
      return;
    }

    try {
      let type = null;
      let sourceMessage = null;

      // 1) essai direct depuis la citation (marche si pas encore ouverte)
      if (quoted) {
        const unwrapped = quoted.viewOnceMessageV2?.message
          || quoted.viewOnceMessageV2Extension?.message
          || quoted.viewOnceMessage?.message
          || quoted;
        if (unwrapped?.imageMessage) { type = 'image'; sourceMessage = unwrapped; }
        else if (unwrapped?.videoMessage) { type = 'video'; sourceMessage = unwrapped; }
        else if (unwrapped?.audioMessage) { type = 'audio'; sourceMessage = unwrapped; }
      }

      // 2) repli sur le cache si la citation ne contient plus le vrai média
      if (!sourceMessage && stanzaId) {
        const cachedVO = viewOnceCache.get(stanzaId);
        if (cachedVO) {
          type = cachedVO.type;
          sourceMessage = cachedVO.message;
        }
      }

      if (!sourceMessage) {
        await sock.sendMessage(chatJid, { text: '❌ Média introuvable. La vue unique a peut-être expiré.' }, { quoted: msg });
        return;
      }

      if (type === 'image') {
        const buffer = await downloadMediaMessage({ message: { imageMessage: sourceMessage.imageMessage } }, 'buffer', {});
        await sock.sendMessage(chatJid, { image: buffer, caption: sourceMessage.imageMessage.caption || '' });
      } else if (type === 'video') {
        const buffer = await downloadMediaMessage({ message: { videoMessage: sourceMessage.videoMessage } }, 'buffer', {});
        await sock.sendMessage(chatJid, {
          video: buffer,
          caption: sourceMessage.videoMessage.caption || '',
          gifPlayback: sourceMessage.videoMessage.gifPlayback || false,
        });
      } else if (type === 'audio') {
        const buffer = await downloadMediaMessage({ message: { audioMessage: sourceMessage.audioMessage } }, 'buffer', {});
        await sock.sendMessage(chatJid, {
          audio: buffer,
          mimetype: sourceMessage.audioMessage.mimetype || 'audio/ogg; codecs=opus',
          ptt: sourceMessage.audioMessage.ptt !== false,
        });
      }
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Erreur lors de l'extraction du média : ${e.message}` }, { quoted: msg });
    }
  },
};
