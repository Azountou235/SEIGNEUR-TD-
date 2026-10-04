// .togroupstatus — publie un texte/image/vidéo/audio comme statut DU GROUPE
//
// CORRECTIFS :
// 1) L'ancienne version ne regardait QUE les médias cités en réponse
//    (contextInfo.quotedMessage). Si on envoyait directement une image/
//    vidéo avec .togroupstatus en légende (sans répondre à un message),
//    le média était totalement ignoré et seul le texte de la légende
//    était posté. Cette version gère maintenant les DEUX cas : média
//    envoyé directement, ET média cité en réponse.
// 2) Ajout des champs isGroupStatus / deviceListMetadata que WhatsApp
//    exige pour accepter un vrai statut de groupe (sans ça, WhatsApp
//    pouvait silencieusement ignorer le message).
// 3) Gère aussi les messages "à visualisation unique" / éphémères, qui
//    enveloppent le vrai contenu dans ephemeralMessage/viewOnceMessage.
const crypto = require('crypto');
const {
  downloadMediaMessage,
  generateWAMessageFromContent,
  proto,
  prepareWAMessageMedia,
} = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');

function resolveJid(msg) {
  const jid = msg.key.remoteJid;
  return jid.endsWith('@lid') && msg.key.remoteJidAlt ? msg.key.remoteJidAlt : jid;
}

// Retire les enveloppes éphémère / vue unique pour atteindre le vrai contenu.
function unwrap(message) {
  if (!message) return message;
  return (
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message
  );
}

async function postGroupStatus(sock, jid, content) {
  let innerMessage;

  if (content.text) {
    innerMessage = {
      extendedTextMessage: { text: content.text, font: 0, textArgb: 0xffffffff, backgroundArgb: 0xff075e54 },
    };
  } else {
    const mediaOpts = {};
    let mediaType;
    if (content.image) { mediaOpts.image = content.image; mediaOpts.caption = content.caption; mediaType = 'imageMessage'; }
    else if (content.video) { mediaOpts.video = content.video; mediaOpts.caption = content.caption; mediaType = 'videoMessage'; }
    else if (content.audio) { mediaOpts.audio = content.audio; mediaOpts.mimetype = content.mimetype || 'audio/mp4'; mediaType = 'audioMessage'; }
    else throw new Error('Type de contenu non pris en charge pour un statut de groupe.');

    const prepared = await prepareWAMessageMedia(mediaOpts, { upload: sock.waUploadToServer });
    const mediaMsg = prepared[mediaType];
    if (!mediaMsg) throw new Error(`prepareWAMessageMedia n'a pas retourné ${mediaType}`);
    if (!mediaMsg.mediaKeyTimestamp) mediaMsg.mediaKeyTimestamp = Math.floor(Date.now() / 1000);
    innerMessage = { [mediaType]: mediaMsg };
  }

  const fullMessage = {
    groupStatusMessageV2: {
      message: {
        ...innerMessage,
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2, isGroupStatus: true },
      },
    },
  };

  const waMsg = generateWAMessageFromContent(jid, proto.Message.create(fullMessage), { userJid: sock.user.id });
  await sock.relayMessage(jid, waMsg.message, { messageId: waMsg.key.id });
}

module.exports = {
  name: 'togroupstatus',
  aliases: ['groupstatus', 'statusgroup'],
  description: "Publie un texte/image/vidéo/audio comme statut du groupe (visible par tous les membres).",
  execute: async (sock, msg, args) => {
    const jid = resolveJid(msg);
    const text = args.join(' ').trim();
    const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    if (!isOwner(msg)) return reply('❌ Commande réservée au owner !');
    if (!jid.endsWith('@g.us')) return reply('❌ Cette commande ne fonctionne que dans un groupe.');

    // Cas 1 : média envoyé DIRECTEMENT avec .togroupstatus en légende.
    const directMessage = unwrap(msg.message);
    const directKey = msg.key;
    let sourceMessage = null, sourceKey = null;

    if (directMessage?.imageMessage || directMessage?.videoMessage || directMessage?.audioMessage) {
      sourceMessage = directMessage;
      sourceKey = directKey;
    } else {
      // Cas 2 : média cité en RÉPONSE (reply).
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = unwrap(ctx?.quotedMessage);
      if (quoted) {
        sourceMessage = quoted;
        sourceKey = { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant || msg.key.participant };
      }
    }

    if (!text && !sourceMessage) {
      return reply(
        '📌 Usage :\n' +
        '• .togroupstatus <texte>\n' +
        '• Envoie une image/vidéo/audio avec .togroupstatus en légende\n' +
        '• Ou réponds à une image/vidéo/audio/texte avec .togroupstatus [légende]'
      );
    }

    await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

    try {
      let content;
      const quotedText = sourceMessage?.conversation || sourceMessage?.extendedTextMessage?.text;
      const mediaType = sourceMessage
        ? Object.keys(sourceMessage).find((k) => ['imageMessage', 'videoMessage', 'audioMessage'].includes(k))
        : null;

      if (mediaType) {
        const buffer = await downloadMediaMessage({ message: sourceMessage, key: sourceKey }, 'buffer', {});
        const caption = text || sourceMessage[mediaType]?.caption || '';
        if (mediaType === 'imageMessage') content = { image: buffer, caption };
        else if (mediaType === 'videoMessage') content = { video: buffer, caption };
        else content = { audio: buffer, mimetype: sourceMessage.audioMessage?.mimetype || 'audio/mp4' };
      } else if (quotedText) {
        content = { text: text || quotedText };
      } else if (text) {
        content = { text };
      } else {
        return reply('❌ Message cité non pris en charge. Réponds à un texte, une image, une vidéo ou un audio.');
      }

      await postGroupStatus(sock, jid, content);
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
      await reply('✅ Statut du groupe publié.');
    } catch (err) {
      console.error('[TOGROUPSTATUS ERROR]', err);
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await reply(`❌ Erreur lors de la publication : ${err.message}`);
    }
  },
};
