const { isOwner } = require('../utils/isOwner');
const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');

module.exports = {
  name: 'kickall',
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
      await sock.sendMessage(chatJid, { text: '🚫 Je dois être admin du groupe pour retirer des membres.' }, { quoted: msg });
      return;
    }

    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

    const targets = (metadata.participants || [])
      .map((p) => p.id)
      .filter((id) => id !== botJid && id !== senderJid);

    if (!targets.length) {
      await sock.sendMessage(chatJid, { text: '⚠️ Aucun membre à retirer.' }, { quoted: msg });
      return;
    }

    try {
      await sock.groupParticipantsUpdate(chatJid, targets, 'remove');
      await sock.sendMessage(chatJid, {
        text: `✅ ${targets.length} membre(s) retiré(s).`,
      }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
