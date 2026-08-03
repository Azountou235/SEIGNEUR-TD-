const { isOwner } = require('../utils/isOwner');
const { isSenderAdmin } = require('../utils/isAdmin');
const { resetWarnings, getWarnings } = require('../utils/warnings');

module.exports = {
  name: 'unwarn',
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
        text: '⚠️ Écrivez le numéro devant *.unwarn*, ou mentionnez la personne, ou répondez à son message.',
      }, { quoted: msg });
      return;
    }

    if (getWarnings(chatJid, target) === 0) {
      await sock.sendMessage(chatJid, { text: `ℹ️ @${target.split('@')[0]} n'a aucun avertissement.`, mentions: [target] }, { quoted: msg });
      return;
    }

    resetWarnings(chatJid, target);
    await sock.sendMessage(chatJid, { text: `✅ Avertissements de @${target.split('@')[0]} réinitialisés.`, mentions: [target] }, { quoted: msg });
  },
};
