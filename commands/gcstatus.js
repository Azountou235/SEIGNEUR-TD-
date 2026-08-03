const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'gcstatus',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut faire ça.' }, { quoted: msg });
      return;
    }
    if (!chatJid.endsWith('@g.us')) {
      await sock.sendMessage(chatJid, { text: '⚠️ Utilisez cette commande depuis le groupe concerné.' }, { quoted: msg });
      return;
    }
    const text = args.join(' ').trim();
    if (!text) {
      await sock.sendMessage(chatJid, { text: '⚠️ Usage : .gcstatus <texte>' }, { quoted: msg });
      return;
    }
    try {
      const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
      const payload = { groupStatusMessageV2: { message: { extendedTextMessage: { text, font: 2 } } } };
      const waMsg = generateWAMessageFromContent(chatJid, proto.Message.fromObject(payload), { userJid: sock.user.id });
      await sock.relayMessage(chatJid, waMsg.message, { messageId: waMsg.key.id });
      await sock.sendMessage(chatJid, { text: '✅ Statut de groupe publié.' }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec (fonctionnalité expérimentale) : ${e.message}` }, { quoted: msg });
    }
  },
};
