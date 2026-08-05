const crypto = require('crypto');
const { downloadMediaMessage, generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');

function randomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

async function postGroupStatus(sock, jid, content) {
  const inside = await generateWAMessageContent(content, { upload: sock.waUploadToServer });
  const messageSecret = crypto.randomBytes(32);
  const m = generateWAMessageFromContent(
    jid,
    {
      messageContextInfo: { messageSecret },
      groupStatusMessageV2: {
        message: { ...inside, messageContextInfo: { messageSecret } },
      },
    },
    {},
  );
  await sock.relayMessage(jid, m.message, { messageId: m.key.id });
}

module.exports = {
  name: 'gcstatus',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    if (!isOwner(msg)) {
      await sock.sendMessage(jid, { text: '🚫 Seul le owner peut faire ça.' }, { quoted: msg });
      return;
    }
    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: '⚠️ Utilisez cette commande depuis le groupe concerné.' }, { quoted: msg });
      return;
    }

    const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const textInput = args.join(' ').trim();

    await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

    try {
      if (quotedMessage) {
        if (quotedMessage.videoMessage) {
          const buffer = await downloadMediaMessage({ message: { videoMessage: quotedMessage.videoMessage } }, 'buffer', {});
          await postGroupStatus(sock, jid, {
            video: buffer,
            caption: textInput || '',
            mimetype: quotedMessage.videoMessage.mimetype || 'video/mp4',
            backgroundColor: randomColor(),
          });
          await sock.sendMessage(jid, { react: { text: '☑️', key: msg.key } });
          await sock.sendMessage(sender, { text: '✅ Status vidéo publié !' });
        } else if (quotedMessage.imageMessage) {
          const buffer = await downloadMediaMessage({ message: { imageMessage: quotedMessage.imageMessage } }, 'buffer', {});
          await postGroupStatus(sock, jid, {
            image: buffer,
            caption: textInput || '',
            backgroundColor: randomColor(),
          });
          await sock.sendMessage(jid, { react: { text: '☑️', key: msg.key } });
          await sock.sendMessage(sender, { text: '✅ Status image publié !' });
        } else if (quotedMessage.audioMessage) {
          const buffer = await downloadMediaMessage({ message: { audioMessage: quotedMessage.audioMessage } }, 'buffer', {});
          await postGroupStatus(sock, jid, {
            audio: buffer,
            mimetype: quotedMessage.audioMessage.mimetype || 'audio/mp4',
            backgroundColor: randomColor(),
          });
          await sock.sendMessage(jid, { react: { text: '☑️', key: msg.key } });
          await sock.sendMessage(sender, { text: '✅ Status audio publié !' });
        } else {
          const quotedText = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || '';
          const textToUse = textInput || quotedText;
          if (!textToUse) throw new Error('Aucun texte à publier');

          await postGroupStatus(sock, jid, { text: textToUse, backgroundColor: randomColor() });
          await sock.sendMessage(jid, { react: { text: '☑️', key: msg.key } });
          await sock.sendMessage(sender, { text: '✅ Status texte publié !' });
        }
      } else if (textInput) {
        await postGroupStatus(sock, jid, { text: textInput, backgroundColor: randomColor() });
        await sock.sendMessage(jid, { react: { text: '☑️', key: msg.key } });
        await sock.sendMessage(sender, { text: '✅ Status texte publié !' });
      } else {
        await sock.sendMessage(sender, {
          text: '❌ Envoie un texte ou réponds à un média.\nExemple : .gcstatus Salut',
        }, { quoted: msg });
        await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      }
    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(sender, { text: `❌ Erreur : ${e.message}` });
    }
  },
};
