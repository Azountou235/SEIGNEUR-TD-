const { isOwner } = require('../utils/isOwner');
const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
const { addWarning } = require('../utils/warnings');

module.exports = {
  name: 'warn',
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

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
    const digits = (args[0] || '').replace(/[^0-9]/g, '');
    const target = mentioned || quoted || (digits ? `${digits}@s.whatsapp.net` : null);

    if (!target) {
      await sock.sendMessage(chatJid, {
        text: '⚠️ Écrivez le numéro devant *.warn*, ou mentionnez la personne, ou répondez à son message.',
      }, { quoted: msg });
      return;
    }

    const count = addWarning(chatJid, target);
    const text = count >= 3
      ? `🚫 @${target.split('@')[0]} a atteint 3 avertissements.`
      : `⚠️ @${target.split('@')[0]} averti (${count}/3).`;

    if (count >= 3 && isBotAdmin(sock, metadata)) {
      try {
        await sock.groupParticipantsUpdate(chatJid, [target], 'remove');
        await sock.sendMessage(chatJid, { text: `${text} Il/elle a été retiré(e) du groupe.`, mentions: [target] }, { quoted: msg });
        return;
      } catch (e) {
        // fall through to just send the warning text
      }
    }

    await sock.sendMessage(chatJid, { text, mentions: [target] }, { quoted: msg });
  },
};
