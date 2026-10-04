// .togroupstatus — publie un texte/image/vidéo/audio comme statut, visible
// uniquement par les membres du groupe.
//
// CHANGEMENT : la version précédente essayait de construire un vrai "statut
// de groupe" WhatsApp (groupStatusMessageV2) en fabriquant le message à la
// main. Ce format n'est pas documenté par Baileys, change selon les
// versions, et WhatsApp peut l'ignorer silencieusement sans erreur — ce qui
// correspond exactement à "il dit publié mais rien n'apparaît".
//
// Cette version utilise à la place l'API standard et stable de Baileys
// (sock.sendMessage vers 'status@broadcast' avec statusJidList) : c'est un
// statut PERSONNEL, mais visible uniquement par les membres du groupe. Elle
// gère texte, image, vidéo et audio, envoyés directement en légende ou
// cités en réponse.
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');

function resolveJid(msg) {
  const jid = msg.key.remoteJid;
  return jid.endsWith('@lid') && msg.key.remoteJidAlt ? msg.key.remoteJidAlt : jid;
}

function unwrap(message) {
  if (!message) return message;
  return (
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message
  );
}

async function postScopedStatus(sock, jid, content) {
  const metadata = await sock.groupMetadata(jid);
  const recipients = metadata.participants
    .map((p) => p.id)
    .filter((id) => id && id.endsWith('@s.whatsapp.net'));
  const me = (sock.user?.id || '').split(':')[0] + '@s.whatsapp.net';
  if (!recipients.includes(me)) recipients.push(me);

  await sock.sendMessage('status@broadcast', content, {
    backgroundColor: '#075E54',
    font: 1,
    statusJidList: recipients,
    broadcast: true,
  });
  return recipients.length;
}

module.exports = {
  name: 'togroupstatus',
  aliases: ['groupstatus', 'statusgroup'],
  description: "Publie un texte/image/vidéo/audio en statut, visible par les membres du groupe.",
  execute: async (sock, msg, args) => {
    const jid = resolveJid(msg);
    const text = args.join(' ').trim();
    const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    if (!isOwner(msg)) return reply('❌ Commande réservée au owner !');
    if (!jid.endsWith('@g.us')) return reply('❌ Cette commande ne fonctionne que dans un groupe.');

    // Cas 1 : média envoyé DIRECTEMENT avec .togroupstatus en légende.
    const directMessage = unwrap(msg.message);
    let sourceMessage = null, sourceKey = null;

    if (directMessage?.imageMessage || directMessage?.videoMessage || directMessage?.audioMessage) {
      sourceMessage = directMessage;
      sourceKey = msg.key;
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
        else content = { audio: buffer, mimetype: sourceMessage.audioMessage?.mimetype || 'audio/mp4', ptt: !!sourceMessage.audioMessage?.ptt };
      } else if (quotedText) {
        content = { text: text || quotedText };
      } else {
        content = { text };
      }

      const count = await postScopedStatus(sock, jid, content);
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
      await reply(`✅ Statut publié, visible par ${count} membre(s) du groupe.`);
    } catch (err) {
      console.error('[TOGROUPSTATUS ERROR]', err);
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await reply(`❌ Erreur lors de la publication : ${err.message}`);
    }
  },
};
