const { isOwner } = require('../utils/isOwner');
const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');

function resolveTargets(msg, args) {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
  const targets = new Set(mentioned);
  if (quotedParticipant) targets.add(quotedParticipant);

  for (const a of args) {
    const digits = a.replace(/[^0-9]/g, '');
    if (digits.length >= 8) targets.add(`${digits}@s.whatsapp.net`);
  }

  return [...targets];
}

module.exports = {
  name: 'kick',
  aliases: ['remove'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!chatJid.endsWith('@g.us')) {
      await sock.sendMessage(chatJid, { text: '⚠️ Cette commande ne fonctionne que dans un groupe.' }, { quoted: msg });
      return;
    }

    const senderJid = msg.key.participant || chatJid;
    const metadata = await sock.groupMetadata(chatJid);

    if (!isOwner(msg) && !isSenderAdmin(metadata, senderJid)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul un admin du groupe peut utiliser cette commande.' }, { quoted: msg });
      return;
    }

    if (!isBotAdmin(sock, metadata)) {
      await sock.sendMessage(chatJid, { text: '🚫 Je dois être admin du groupe pour retirer quelqu\'un.' }, { quoted: msg });
      return;
    }

    const targets = resolveTargets(msg, args);

    if (!targets.length) {
      await sock.sendMessage(chatJid, {
        text: '⚠️ Écrivez le numéro que vous voulez retirer devant *.kick*, ou mentionnez la personne, ou répondez à son message.\n\nExemple : .kick 23591234567\nExemple : .kick @personne',
      }, { quoted: msg });
      return;
    }

    try {
      await sock.groupParticipantsUpdate(chatJid, targets, 'remove');
      await sock.sendMessage(chatJid, {
        text: `✅ Retiré du groupe : ${targets.map((t) => `@${t.split('@')[0]}`).join(', ')}`,
        mentions: targets,
      }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
