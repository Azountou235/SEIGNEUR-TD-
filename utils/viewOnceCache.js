const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

/**
 * Envoie en privé au owner un média à vue unique déjà caché dans
 * viewOnceCache (utilisé par le mode .auto — dès l'arrivée du message,
 * sans avoir besoin d'une réponse manuelle).
 */
async function sendCachedViewOnce(sock, cached) {
  const { message, type, senderJid, remoteJid } = cached;
  const ownerJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
  if (!ownerJid || !message) return false;

  const senderTag = senderJid ? `@${senderJid.split('@')[0]}` : 'quelqu\'un';
  const media = message[`${type}Message`] || message;

  if (type === 'image') {
    const buffer = await downloadMediaMessage({ message: { imageMessage: media } }, 'buffer', {});
    await sock.sendMessage(ownerJid, {
      image: buffer,
      caption: `👁️ Photo à vue unique (auto), envoyée par ${senderTag} dans ${remoteJid}${media.caption ? '\n\n' + media.caption : ''}`,
      mentions: senderJid ? [senderJid] : [],
    });
  } else if (type === 'video') {
    const buffer = await downloadMediaMessage({ message: { videoMessage: media } }, 'buffer', {});
    await sock.sendMessage(ownerJid, {
      video: buffer,
      caption: `👁️ Vidéo à vue unique (auto), envoyée par ${senderTag} dans ${remoteJid}${media.caption ? '\n\n' + media.caption : ''}`,
      mentions: senderJid ? [senderJid] : [],
    });
  } else if (type === 'audio') {
    const buffer = await downloadMediaMessage({ message: { audioMessage: media } }, 'buffer', {});
    await sock.sendMessage(ownerJid, {
      audio: buffer,
      mimetype: media.mimetype || 'audio/ogg; codecs=opus',
      ptt: true,
      caption: `🎙️ Note vocale à vue unique (auto), envoyée par ${senderTag} dans ${remoteJid}`,
      mentions: senderJid ? [senderJid] : [],
    });
  } else {
    return false;
  }
  return true;
}

async function grabViewOnce(sock, msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const quotedMsg = ctx?.quotedMessage;
  if (!quotedMsg) return false;

  const unwrapped = quotedMsg.viewOnceMessageV2?.message || quotedMsg.viewOnceMessage?.message || quotedMsg;
  const voImage = unwrapped?.imageMessage || null;
  const voVideo = unwrapped?.videoMessage || null;
  const voVoice = unwrapped?.audioMessage || null;

  const ownerJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
  const quotedSenderJid = ctx?.participant;
  const senderTag = quotedSenderJid ? `@${quotedSenderJid.split('@')[0]}` : 'quelqu\'un';

  if (!ownerJid || (!voImage && !voVideo && !voVoice)) return false;

  if (voImage) {
    const buffer = await downloadMediaMessage({ message: { imageMessage: voImage } }, 'buffer', {});
    await sock.sendMessage(ownerJid, {
      image: buffer,
      caption: `👁️ Photo à vue unique récupérée, envoyée par ${senderTag} dans ${msg.key.remoteJid}${voImage.caption ? '\n\n' + voImage.caption : ''}`,
      mentions: quotedSenderJid ? [quotedSenderJid] : [],
    });
  } else if (voVideo) {
    const buffer = await downloadMediaMessage({ message: { videoMessage: voVideo } }, 'buffer', {});
    await sock.sendMessage(ownerJid, {
      video: buffer,
      caption: `👁️ Vidéo à vue unique récupérée, envoyée par ${senderTag} dans ${msg.key.remoteJid}${voVideo.caption ? '\n\n' + voVideo.caption : ''}`,
      mentions: quotedSenderJid ? [quotedSenderJid] : [],
    });
  } else if (voVoice) {
    const buffer = await downloadMediaMessage({ message: { audioMessage: voVoice } }, 'buffer', {});
    await sock.sendMessage(ownerJid, {
      audio: buffer,
      mimetype: voVoice.mimetype || 'audio/ogg; codecs=opus',
      ptt: true,
      caption: `🎙️ Note vocale à vue unique récupérée, envoyée par ${senderTag} dans ${msg.key.remoteJid}`,
      mentions: quotedSenderJid ? [quotedSenderJid] : [],
    });
  }
  return true;
}

module.exports = { grabViewOnce, sendCachedViewOnce };
