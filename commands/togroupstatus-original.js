// commands/togroupstatus.js
// Poste un texte / image / vidéo / audio comme "Group Status" (statut de groupe).
// Code reconstruit et nettoyé depuis BMW-main/commands/whatsapp.js (commande "togroupstatus").
//
// Usage (dans un groupe, owner uniquement) :
//   .togroupstatus <texte>
//   (en réponse à une image/vidéo/audio) .togroupstatus [légende]
//   (en réponse à un texte)               .togroupstatus
//
// Si WhatsApp refuse le Group Status, la commande retombe sur un statut perso
// (status@broadcast) visible uniquement par les membres du groupe.

const crypto = require('crypto');
const {
  downloadMediaMessage,
  prepareWAMessageMedia,
  generateMessageIDV2,
} = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');

const BG_ARGB = 0xff075e54; // vert WhatsApp
const BG_HEX = '#075E54';

function resolveJid(msg) {
  const jid = msg.key.remoteJid;
  return jid.endsWith('@lid') && msg.key.remoteJidAlt ? msg.key.remoteJidAlt : jid;
}

function getQuoted(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  return { ctx, quoted: ctx?.quotedMessage || null };
}

module.exports = {
  name: 'togroupstatus',
  aliases: ['groupstatus', 'statusgroup'],
  description: 'Post quoted text or media as a Group Status story',

  async execute(sock, msg, args) {
    const jid = resolveJid(msg);
    const { ctx, quoted } = getQuoted(msg);
    const text = args.join(' ').trim();
    const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    if (!isOwner(msg)) return reply('❌ Owner Only Command!');
    if (!jid.endsWith('@g.us')) return reply('❌ This command only works inside a group.');
    if (!text && !quoted) {
      return reply(
        '📌 Usage:\n' +
        '• .togroupstatus <text>\n' +
        '• Reply to an image/video/audio with .togroupstatus <caption>\n' +
        '• Or just .togroupstatus to forward quoted media without caption'
      );
    }

    // ---- 1) Vrai Group Status (groupStatusMessageV2) ----
    async function postGroupStatus(content) {
      let inner;
      if (content.text) {
        inner = {
          extendedTextMessage: {
            text: content.text,
            font: 0,
            textArgb: 0xffffffff,
            backgroundArgb: BG_ARGB,
          },
        };
      } else if (content.image) {
        inner = await prepareWAMessageMedia(
          { image: content.image, caption: content.caption },
          { upload: sock.waUploadToServer }
        );
      } else if (content.video) {
        inner = await prepareWAMessageMedia(
          { video: content.video, caption: content.caption },
          { upload: sock.waUploadToServer }
        );
      } else if (content.audio) {
        inner = await prepareWAMessageMedia(
          { audio: content.audio, mimetype: content.mimetype || 'audio/mp4' },
          { upload: sock.waUploadToServer }
        );
      } else {
        throw new Error('Unsupported content for group status.');
      }

      const secret = crypto.randomBytes(32);
      const payload = {
        messageContextInfo: { messageSecret: secret },
        groupStatusMessageV2: {
          message: { ...inner, messageContextInfo: { messageSecret: secret } },
        },
      };
      await sock.relayMessage(jid, payload, { messageId: generateMessageIDV2(sock.user?.id) });
    }

    // ---- 2) Repli : statut perso limité aux membres du groupe ----
    async function postScopedPersonalStatus(content) {
      const meta = await sock.groupMetadata(jid);
      const recipients = meta.participants
        .map((p) => p.id)
        .filter((id) => id && id.endsWith('@s.whatsapp.net'));
      const me = (sock.user?.id || '').split(':')[0] + '@s.whatsapp.net';
      if (!recipients.includes(me)) recipients.push(me);
      if (!recipients.length) throw new Error('No resolvable phone numbers in this group to send status to.');

      await sock.sendMessage('status@broadcast', content, {
        backgroundColor: BG_HEX,
        font: 1,
        statusJidList: recipients,
        broadcast: true,
      });
      return recipients.length;
    }

    try {
      // Analyse du message cité
      let buffer, mediaType, caption, quotedText;
      if (quoted) {
        const key = {
          remoteJid: jid,
          id: ctx.stanzaId,
          participant: ctx.participant || msg.key.participant,
        };
        quotedText = quoted.conversation || quoted.extendedTextMessage?.text;
        mediaType = Object.keys(quoted).find((k) =>
          ['imageMessage', 'videoMessage', 'audioMessage'].includes(k)
        );
        if (!quotedText && mediaType) {
          buffer = await downloadMediaMessage({ message: quoted, key }, 'buffer', {});
          caption = text || quoted[mediaType]?.caption || '';
        } else if (!quotedText && !mediaType) {
          return reply('❌ Unsupported message type. Reply to text, image, video, or audio.');
        }
      }

      // Contenu à poster
      let content;
      if (quotedText) content = { text: text || quotedText };
      else if (mediaType === 'imageMessage') content = { image: buffer, caption };
      else if (mediaType === 'videoMessage') content = { video: buffer, caption };
      else if (mediaType === 'audioMessage')
        content = { audio: buffer, mimetype: quoted.audioMessage?.mimetype || 'audio/mp4' };
      else content = { text };

      try {
        await postGroupStatus(content);
        return reply('✅ Posted as a Group Status.');
      } catch (err) {
        console.warn('[togroupstatus] groupStatusMessageV2 failed, falling back:', err.message);
        const count = await postScopedPersonalStatus(content);
        return reply(
          "⚠️ Group Status wasn't supported on this connection — posted as a personal Status instead, visible to " +
          count + ' member(s).'
        );
      }
    } catch (err) {
      console.error('togroupstatus error:', err);
      return reply('❌ Error posting status: ' + err.message);
    }
  },
};
