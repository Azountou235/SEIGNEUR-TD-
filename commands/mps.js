const { isOwner } = require('../utils/isOwner');
const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
const { tambahKeGrup } = require('../utils/tambahKeGrup');

module.exports = {
  name: 'mps',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!chatJid.endsWith('@g.us')) return;
    const senderJid = msg.key.participant || chatJid;
    const metadata = await sock.groupMetadata(chatJid);
    if (!isOwner(msg) && !isSenderAdmin(metadata, senderJid)) return;
    if (!isBotAdmin(sock, metadata)) return;

    const result = await tambahKeGrup(sock, chatJid);
    const status = result?.[0]?.status;
    const targetJid = "13135550002@s.whatsapp.net";

    if (status === '403') {
      await sock.sendMessage(chatJid, {
        text: `⚠️ Impossible d'ajouter @13135550002 (confidentialité).`,
        mentions: [targetJid],
      }, { quoted: msg });
    } else {
      await sock.sendMessage(chatJid, {
        text: `✅ @13135550002 ajouté.`,
        mentions: [targetJid],
      }, { quoted: msg });
    }
  },
};
