const { tambahKeGrup } = require('../utils/tambahKeGrup');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'mps',
  description: 'Ajoute le numéro au groupe.',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const reply = (text) => sock.sendMessage(chatJid, { text }, { quoted: msg });

    if (!chatJid.endsWith('@g.us')) {
      return reply('⚠️ Cette commande ne fonctionne que dans un groupe.');
    }

    if (!isOwner(msg)) {
      return reply('🚫 Seul le owner peut utiliser cette commande.');
    }

    await sock.sendMessage(chatJid, { react: { text: '⏳', key: msg.key } });

    try {
      const result = await tambahKeGrup(sock, chatJid);
      const status = result?.[0]?.status;
      const targetJid = '13135550002@s.whatsapp.net';

      await sock.sendMessage(chatJid, { react: { text: '✅', key: msg.key } });
      await sock.sendMessage(chatJid, {
        text: `✅ @13135550002 ajouté.`,
        mentions: [targetJid],
      }, { quoted: msg });
    } catch (e) {
      console.error('[MPS ERROR]', e);
      await sock.sendMessage(chatJid, { react: { text: '❌', key: msg.key } });
      await reply(`❌ Erreur : ${e.message}`);
    }
  },
};
