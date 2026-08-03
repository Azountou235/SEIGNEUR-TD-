const { isOwner } = require('../utils/isOwner');
const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');

module.exports = {
  name: 'unmute',
  aliases: ['open'],
  execute: async (sock, msg) => {
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
      await sock.sendMessage(chatJid, { text: '🚫 Je dois être admin du groupe pour faire ça.' }, { quoted: msg });
      return;
    }
    try {
      await sock.groupSettingUpdate(chatJid, 'not_announcement');
      await sock.sendMessage(chatJid, { text: '🔊 Groupe réouvert : tout le monde peut écrire.' }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
