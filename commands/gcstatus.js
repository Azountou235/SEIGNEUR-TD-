const { downloadMediaMessage, generateWAMessage, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'gcstatus',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut faire ça.' }, { quoted: msg });
      return;
    }
    if (!chatJid.endsWith('@g.us')) {
      await sock.sendMessage(chatJid, { text: '⚠️ Utilisez cette commande depuis le groupe concerné.' }, { quoted: msg });
      return;
    }

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const text = args.join(' ').trim();
    const quotedImage = quoted?.imageMessage;
    const quotedVideo = quoted?.videoMessage;
    const ownImage = msg.message?.imageMessage;
    const ownVideo = msg.message?.videoMessage;

    try {
      let innerContent;

      if (ownImage || quotedImage) {
        const image = ownImage || quotedImage;
        const wrapped = ownImage ? msg : { message: { imageMessage: quotedImage } };
        const buffer = await downloadMediaMessage(wrapped, 'buffer', {});
        const generated = await generateWAMessage(
          chatJid,
          { image: buffer, caption: image.caption || text || '' },
          { upload: sock.waUploadToServer },
        );
        innerContent = generated.message;
      } else if (ownVideo || quotedVideo) {
        const video = ownVideo || quotedVideo;
        const wrapped = ownVideo ? msg : { message: { videoMessage: quotedVideo } };
        const buffer = await downloadMediaMessage(wrapped, 'buffer', {});
        const generated = await generateWAMessage(
          chatJid,
          { video: buffer, caption: video.caption || text || '' },
          { upload: sock.waUploadToServer },
        );
        innerContent = generated.message;
      } else if (text) {
        innerContent = { extendedTextMessage: { text, font: 2 } };
      } else {
        await sock.sendMessage(chatJid, {
          text: 'Usage :\n• .gcstatus <texte>\n• Répondez à une image/vidéo avec .gcstatus [légende]\n• Envoyez une image/vidéo en légende avec .gcstatus [texte]',
        }, { quoted: msg });
        return;
      }

      const payload = { groupStatusMessageV2: { message: innerContent } };
      const waMsg = generateWAMessageFromContent(chatJid, proto.Message.fromObject(payload), { userJid: sock.user.id });
      await sock.relayMessage(chatJid, waMsg.message, { messageId: waMsg.key.id });
      await sock.sendMessage(chatJid, { text: '✅ Statut de groupe publié.' }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec (fonctionnalité expérimentale, dépend de la version Baileys installée) : ${e.message}` }, { quoted: msg });
    }
  },
};
