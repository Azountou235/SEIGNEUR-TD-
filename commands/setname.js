const { isOwner } = require('../utils/isOwner');
const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');

module.exports = {
  name: 'setname',
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
      await sock.sendMessage(chatJid, { text: '🚫 Je dois être admin du groupe pour changer le nom.' }, { quoted: msg });
      return;
    }
    const newName = args.join(' ');
    if (!newName) {
      await sock.sendMessage(chatJid, { text: '⚠️ Écrivez le nouveau nom devant *.setname*.\n\nExemple : .setname Ma Team' }, { quoted: msg });
      return;
    }
    try {
      await sock.groupUpdateSubject(chatJid, newName);
      await sock.sendMessage(chatJid, { text: `✅ Nom du groupe changé en : *${newName}*` }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
