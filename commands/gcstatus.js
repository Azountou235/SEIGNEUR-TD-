const crypto = require('crypto');
const { downloadMediaMessage, generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');

const COLORS = {
  noir: 0xFF000000,
  blanc: 0xFFFFFFFF,
  rouge: 0xFFFF0000,
  vert: 0xFF25D366,
  bleu: 0xFF0000FF,
  jaune: 0xFFFFFF00,
  violet: 0xFF800080,
  orange: 0xFFFFA500,
  rose: 0xFFFF69B4,
  gris: 0xFF808080,
};

function randomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

async function postGroupStatus(sock, jid, content, color = null) {
  try {
    const { prepareWAMessageMedia } = require('@whiskeysockets/baileys');
    
    let messagePayload = {};
    
    if (content.text) {
      // TEXT STATUS
      const bgColor = color || (() => {
        const randomHex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
        return 0xff000000 + parseInt(randomHex, 16);
      })();
      
      messagePayload = {
        groupStatusMessageV2: {
          message: {
            extendedTextMessage: {
              text: content.text,
              backgroundArgb: bgColor,
              font: 2
            }
          }
        }
      };
    } else {
      // MEDIA STATUS (Image, Vidéo, Audio)
      const mediaOpts = {};
      
      if (content.image) {
        mediaOpts.image = content.image;
      } else if (content.video) {
        mediaOpts.video = content.video;
        mediaOpts.mimetype = content.mimetype || 'video/mp4';
      } else if (content.audio) {
        mediaOpts.audio = content.audio;
        mediaOpts.mimetype = content.mimetype || 'audio/mpeg';
        if (content.ptt) mediaOpts.ptt = true;
      }
      
      const preparedMedia = await prepareWAMessageMedia(mediaOpts, { upload: sock.waUploadToServer });
      
      let mediaMessage = {};
      if (preparedMedia.imageMessage) mediaMessage = { imageMessage: preparedMedia.imageMessage };
      else if (preparedMedia.videoMessage) mediaMessage = { videoMessage: preparedMedia.videoMessage };
      else if (preparedMedia.audioMessage) mediaMessage = { audioMessage: preparedMedia.audioMessage };
      
      messagePayload = {
        groupStatusMessageV2: {
          message: mediaMessage
        }
      };
    }
    
    const waMsg = generateWAMessageFromContent(jid, proto.Message.fromObject(messagePayload), { userJid: sock.user.id });
    await sock.relayMessage(jid, waMsg.message, { messageId: waMsg.key.id });
    
  } catch (e) {
    throw new Error(`Erreur lors de la publication: ${e.message}`);
  }
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

    const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const fullArgs = args.join(' ').trim();
    let targetGroupId = null;
    let textInput = '';
    let colorInput = '';

    // Parse les arguments: .gcstatus [groupJid], texte, [couleur]
    // OU: .gcstatus texte, [couleur] (si dans un groupe)
    
    if (jid.endsWith('@g.us')) {
      // Utilisé DANS le groupe
      targetGroupId = jid;
      if (fullArgs.includes(',')) {
        const parts = fullArgs.split(',').map(p => p.trim());
        textInput = parts[0];
        colorInput = parts[1] || '';
      } else {
        textInput = fullArgs;
      }
    } else {
      // Utilisé en DM - doit spécifier le JID du groupe
      if (fullArgs.includes('@g.us')) {
        const parts = fullArgs.split(',').map(p => p.trim());
        targetGroupId = parts[0];
        textInput = parts[1] || '';
        colorInput = parts[2] || '';
      } else {
        await sock.sendMessage(jid, {
          text: `⚠️ Utilisez depuis le groupe ou précisez le JID.\n\n📋 Usage:\n• Dans le groupe: *.gcstatus Texte*\n• Avec couleur: *.gcstatus Texte, rouge*\n• Depuis DM: *.gcstatus 123@g.us, Texte, rouge*\n\nCouleurs: ${Object.keys(COLORS).join(', ')}`
        }, { quoted: msg });
        return;
      }
    }

    if (!targetGroupId || !targetGroupId.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: '❌ Le JID du groupe doit se terminer par @g.us (ex: 123456789-123456@g.us)' }, { quoted: msg });
      return;
    }

    await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

    try {
      // MEDIA QUOTED
      if (quotedMessage) {
        // 🎬 VIDEO
        if (quotedMessage.videoMessage) {
          const buffer = await downloadMediaMessage({ message: { videoMessage: quotedMessage.videoMessage } }, 'buffer', {});
          await postGroupStatus(sock, targetGroupId, {
            video: buffer,
            mimetype: quotedMessage.videoMessage.mimetype || 'video/mp4'
          });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
          await sock.sendMessage(sender, { text: '✅ Statut 🎬 Vidéo du groupe publié!' });
          return;
        }
        // 🖼️ IMAGE
        else if (quotedMessage.imageMessage) {
          const buffer = await downloadMediaMessage({ message: { imageMessage: quotedMessage.imageMessage } }, 'buffer', {});
          await postGroupStatus(sock, targetGroupId, {
            image: buffer
          });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
          await sock.sendMessage(sender, { text: '✅ Statut 🖼️ Image du groupe publié!' });
          return;
        }
        // 🎙️ VOICE NOTE
        else if (quotedMessage.audioMessage && quotedMessage.audioMessage.ptt) {
          const buffer = await downloadMediaMessage({ message: { audioMessage: quotedMessage.audioMessage } }, 'buffer', {});
          await postGroupStatus(sock, targetGroupId, {
            audio: buffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true
          });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
          await sock.sendMessage(sender, { text: '✅ Statut 🎙️ Note vocale du groupe publiée!' });
          return;
        }
        // 🔊 AUDIO FILE
        else if (quotedMessage.audioMessage && !quotedMessage.audioMessage.ptt) {
          const buffer = await downloadMediaMessage({ message: { audioMessage: quotedMessage.audioMessage } }, 'buffer', {});
          await postGroupStatus(sock, targetGroupId, {
            audio: buffer,
            mimetype: quotedMessage.audioMessage.mimetype || 'audio/mpeg'
          });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
          await sock.sendMessage(sender, { text: '✅ Statut 🔊 Audio du groupe publié!' });
          return;
        }
      }

      // TEXT STATUS
      if (!textInput) {
        await sock.sendMessage(sender, {
          text: `📤 Envoie un texte ou réponds à un média.\n\n📋 Exemples:\n• *.gcstatus Salut le groupe!*\n• *.gcstatus Salut!, noir*\n• Répondez à une image/vidéo/audio\n\nCouleurs: ${Object.keys(COLORS).join(', ')}`
        }, { quoted: msg });
        await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
        return;
      }

      const chosenColor = colorInput && COLORS[colorInput.toLowerCase()] ? COLORS[colorInput.toLowerCase()] : null;
      await postGroupStatus(sock, targetGroupId, { text: textInput }, chosenColor);
      
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
      const colorLabel = chosenColor ? ` (couleur: ${colorInput})` : '';
      await sock.sendMessage(sender, { text: `✅ Statut 📝 Texte du groupe publié!${colorLabel}` });

    } catch (e) {
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(sender, { text: `❌ Erreur: ${e.message}` });
    }
  },
};
