const crypto = require('crypto');
const { downloadMediaMessage, prepareWAMessageMedia, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
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

async function postGroupStatus(sock, jid, content, color = null) {
  let innerMessage = {};

  if (content.text) {
    const bgColor = color || (() => {
      const randomHex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
      return 0xff000000 + parseInt(randomHex, 16);
    })();
    innerMessage = {
      extendedTextMessage: {
        text: content.text,
        backgroundArgb: bgColor,
        font: 2
      }
    };
  } else {
    const mediaOpts = {};
    let mediaType = null;

    if (content.image) {
      mediaOpts.image = content.image;
      mediaType = 'imageMessage';
    } else if (content.video) {
      mediaOpts.video = content.video;
      mediaOpts.mimetype = content.mimetype || 'video/mp4';
      mediaType = 'videoMessage';
    } else if (content.audio) {
      mediaOpts.audio = content.audio;
      mediaOpts.mimetype = content.mimetype || 'audio/ogg; codecs=opus';
      if (content.ptt) mediaOpts.ptt = true;
      mediaType = 'audioMessage';
    }

    if (!mediaType) throw new Error('Aucun type de média valide fourni.');

    const preparedMedia = await prepareWAMessageMedia(mediaOpts, {
      upload: sock.waUploadToServer
    });
    const mediaMsg = preparedMedia[mediaType];
    if (!mediaMsg) throw new Error(`prepareWAMessageMedia n'a pas retourné ${mediaType}`);

    if (!mediaMsg.mediaKeyTimestamp) mediaMsg.mediaKeyTimestamp = Math.floor(Date.now() / 1000);
    if (content.ptt !== undefined) mediaMsg.ptt = content.ptt;
    if (content.buffer && !mediaMsg.fileLength) mediaMsg.fileLength = content.buffer.length.toString();

    innerMessage = { [mediaType]: mediaMsg };
  }

  const fullMessage = {
    groupStatusMessageV2: {
      message: {
        ...innerMessage,
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
          isGroupStatus: true
        }
      }
    }
  };

  const waMsg = generateWAMessageFromContent(
    jid,
    proto.Message.create(fullMessage),
    { userJid: sock.user.id }
  );

  await sock.relayMessage(jid, waMsg.message, { messageId: waMsg.key.id });
}

function splitTextAndColor(input) {
  const lastComma = input.lastIndexOf(',');
  if (lastComma === -1) return { text: input, color: '' };
  const candidateText = input.slice(0, lastComma).trim();
  const candidateColor = input.slice(lastComma + 1).trim();
  const isKnownColor = candidateColor && (COLORS[candidateColor.toLowerCase()] || /^#?[0-9a-f]{6}$/i.test(candidateColor));
  if (isKnownColor && candidateText) return { text: candidateText, color: candidateColor };
  return { text: input, color: '' };
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

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    let quotedMessage = ctx?.quotedMessage;
    if (quotedMessage?.groupStatusMessageV2?.message) {
      quotedMessage = quotedMessage.groupStatusMessageV2.message;
    }

    const fullArgs = args.join(' ').trim();
    let targetGroupId = null;
    let textInput = '';
    let colorInput = '';

    if (jid.endsWith('@g.us')) {
      targetGroupId = jid;
      const split = splitTextAndColor(fullArgs);
      textInput = split.text;
      colorInput = split.color;
    } else {
      if (fullArgs.includes('@g.us')) {
        const firstComma = fullArgs.indexOf(',');
        const groupId = firstComma === -1 ? fullArgs.trim() : fullArgs.slice(0, firstComma).trim();
        const rest = firstComma === -1 ? '' : fullArgs.slice(firstComma + 1).trim();
        const split = splitTextAndColor(rest);
        targetGroupId = groupId;
        textInput = split.text;
        colorInput = split.color;
      } else {
        await sock.sendMessage(jid, {
          text: `⚠️ Utilisez depuis le groupe ou précisez le JID.\n\nCouleurs: ${Object.keys(COLORS).join(', ')}`
        }, { quoted: msg });
        return;
      }
    }

    if (!targetGroupId || !targetGroupId.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: '❌ JID groupe invalide (doit finir par @g.us)' }, { quoted: msg });
      return;
    }

    await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

    try {
      // MÉDIA CITÉ
      if (quotedMessage) {
        if (quotedMessage.imageMessage) {
          const buffer = await downloadMediaMessage(
            { message: { imageMessage: quotedMessage.imageMessage } },
            'buffer', {}, { logger: console, reuploadRequest: sock.updateMediaMessage }
          );
          await postGroupStatus(sock, targetGroupId, { image: buffer, buffer });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
          await sock.sendMessage(sender, { text: '✅ Statut 🖼️ Image publié!' });
          return;
        }
        if (quotedMessage.videoMessage) {
          const buffer = await downloadMediaMessage(
            { message: { videoMessage: quotedMessage.videoMessage } },
            'buffer', {}, { logger: console, reuploadRequest: sock.updateMediaMessage }
          );
          await postGroupStatus(sock, targetGroupId, {
            video: buffer,
            mimetype: quotedMessage.videoMessage.mimetype || 'video/mp4',
            buffer
          });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
          await sock.sendMessage(sender, { text: '✅ Statut 🎬 Vidéo publié!' });
          return;
        }
        if (quotedMessage.audioMessage) {
          const buffer = await downloadMediaMessage(
            { message: { audioMessage: quotedMessage.audioMessage } },
            'buffer', {}, { logger: console, reuploadRequest: sock.updateMediaMessage }
          );
          const isPtt = !!quotedMessage.audioMessage.ptt;
          await postGroupStatus(sock, targetGroupId, {
            audio: buffer,
            mimetype: isPtt ? 'audio/ogg; codecs=opus' : (quotedMessage.audioMessage.mimetype || 'audio/mpeg'),
            ptt: isPtt,
            buffer
          });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
          await sock.sendMessage(sender, { text: isPtt ? '✅ Statut 🎙️ Note vocale publiée!' : '✅ Statut 🔊 Audio publié!' });
          return;
        }
      }

      // TEXTE
      if (!textInput) {
        await sock.sendMessage(sender, {
          text: `📤 Envoie un texte ou réponds à un média.\nCouleurs: ${Object.keys(COLORS).join(', ')}`
        }, { quoted: msg });
        await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
        return;
      }

      const chosenColor = colorInput && COLORS[colorInput.toLowerCase()] ? COLORS[colorInput.toLowerCase()] : null;
      await postGroupStatus(sock, targetGroupId, { text: textInput }, chosenColor);

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
      const colorLabel = chosenColor ? ` (couleur: ${colorInput})` : '';
      await sock.sendMessage(sender, { text: `✅ Statut 📝 Texte publié!${colorLabel}` });

    } catch (e) {
      console.error('[gcstatus] error:', e);
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(sender, { text: `❌ Erreur: ${e.message}` });
    }
  },
};
