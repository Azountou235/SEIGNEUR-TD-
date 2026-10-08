const { downloadMediaMessage, prepareWAMessageMedia } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');
// Adapte le require selon comment ton bot instancie le socket nyxcore
// (voir note en bas si ce n'est pas ce chemin)
const { sendGroupStatus, unwrapStatusMessage, audioToStatusVideo } = require('@nyxcore/nyxcoresocket');

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

function splitTextAndColor(input) {
  const lastComma = input.lastIndexOf(',');
  if (lastComma === -1) return { text: input, color: '' };
  const candidateText = input.slice(0, lastComma).trim();
  const candidateColor = input.slice(lastComma + 1).trim();
  const isKnownColor =
    candidateColor &&
    (COLORS[candidateColor.toLowerCase()] || /^#?[0-9a-f]{6}$/i.test(candidateColor));
  if (isKnownColor && candidateText) return { text: candidateText, color: candidateColor };
  return { text: input, color: '' };
}

async function downloadQuotedMedia(sock, quotedMessage) {
  if (quotedMessage.imageMessage) {
    const buffer = await downloadMediaMessage(
      { message: { imageMessage: quotedMessage.imageMessage } },
      'buffer',
      {},
      { logger: console, reuploadRequest: sock.updateMediaMessage }
    );
    return {
      type: 'image',
      buffer,
      mimetype: quotedMessage.imageMessage.mimetype || 'image/jpeg',
      caption: quotedMessage.imageMessage.caption || ''
    };
  }
  if (quotedMessage.videoMessage) {
    const buffer = await downloadMediaMessage(
      { message: { videoMessage: quotedMessage.videoMessage } },
      'buffer',
      {},
      { logger: console, reuploadRequest: sock.updateMediaMessage }
    );
    return {
      type: 'video',
      buffer,
      mimetype: quotedMessage.videoMessage.mimetype || 'video/mp4',
      caption: quotedMessage.videoMessage.caption || ''
    };
  }
  if (quotedMessage.audioMessage) {
    const buffer = await downloadMediaMessage(
      { message: { audioMessage: quotedMessage.audioMessage } },
      'buffer',
      {},
      { logger: console, reuploadRequest: sock.updateMediaMessage }
    );
    return {
      type: 'audio',
      buffer,
      mimetype: quotedMessage.audioMessage.mimetype || 'audio/ogg; codecs=opus',
      ptt: !!quotedMessage.audioMessage.ptt
    };
  }
  return null;
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
    // unwrap si on quote un ancien statut groupe
    if (quotedMessage) {
      quotedMessage = unwrapStatusMessage(quotedMessage) || quotedMessage;
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
          text: `⚠️ Utilisez depuis le groupe ou précisez le JID.\n\n📋 Usage:\n• Dans le groupe: *.gcstatus Texte*\n• Avec couleur: *.gcstatus Texte, rouge*\n• Depuis DM: *.gcstatus 123@g.us, Texte, rouge*\n\nCouleurs: ${Object.keys(COLORS).join(', ')}`
        }, { quoted: msg });
        return;
      }
    }

    if (!targetGroupId || !targetGroupId.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: '❌ Le JID du groupe doit se terminer par @g.us' }, { quoted: msg });
      return;
    }

    await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

    try {
      // ---------- MÉDIA CITÉ ----------
      if (quotedMessage) {
        const media = await downloadQuotedMedia(sock, quotedMessage);

        if (media) {
          let options = {};

          if (media.type === 'image') {
            options = { image: media.buffer, caption: media.caption || '' };
          } else if (media.type === 'video') {
            options = { video: media.buffer, mimetype: media.mimetype, caption: media.caption || '' };
          } else if (media.type === 'audio') {
            // WhatsApp n'accepte pas l'audio direct en group status : on le convertit en vidéo
            const videoBuffer = await audioToStatusVideo(media.buffer);
            options = { video: videoBuffer, mimetype: 'video/mp4', caption: '' };
          }

          const sentStatus = await sendGroupStatus(sock, targetGroupId, options);

          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
          await sock.sendMessage(sender, {
            text: `✅ Statut ${media.type === 'image' ? '🖼️ Image' : media.type === 'video' ? '🎬 Vidéo' : '🎙️ Audio'} du groupe publié!\nID: ${sentStatus?.key?.id || 'n/a'}`
          });
          return;
        }
      }

      // ---------- TEXTE ----------
      if (!textInput) {
        await sock.sendMessage(sender, {
          text: `📤 Envoie un texte ou réponds à un média.\n\n📋 Exemples:\n• *.gcstatus Salut le groupe!*\n• *.gcstatus Salut!, noir*\n• Répondez à une image/vidéo/audio\n\nCouleurs: ${Object.keys(COLORS).join(', ')}`
        }, { quoted: msg });
        await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
        return;
      }

      const chosenColor = colorInput && COLORS[colorInput.toLowerCase()]
        ? COLORS[colorInput.toLowerCase()]
        : (() => {
            const randomHex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
            return 0xff000000 + parseInt(randomHex, 16);
          })();

      const sentStatus = await sendGroupStatus(
        sock,
        targetGroupId,
        { text: textInput },
        { backgroundColor: chosenColor, font: 2 }
      );

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
      const colorLabel = colorInput ? ` (couleur: ${colorInput})` : '';
      await sock.sendMessage(sender, {
        text: `✅ Statut 📝 Texte du groupe publié!${colorLabel}\nID: ${sentStatus?.key?.id || 'n/a'}`
      });

    } catch (e) {
      console.error('[gcstatus] error:', e);
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(sender, { text: `❌ Erreur: ${e.message}` });
    }
  },
};
