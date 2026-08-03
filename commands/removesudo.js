const { isOwner } = require('../utils/isOwner');
const { removeSudo } = require('../utils/isSudo');

module.exports = {
  name: 'removesudo',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut retirer un sudo.' }, { quoted: msg });
      return;
    }
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
    const digits = (args[0] || '').replace(/[^0-9]/g, '');
    const target = mentioned || quoted || (digits ? `${digits}@s.whatsapp.net` : null);

    if (!target) {
      await sock.sendMessage(chatJid, { text: '⚠️ Mentionnez la personne, répondez à son message, ou écrivez son numéro devant *.removesudo*.' }, { quoted: msg });
      return;
    }
    const number = target.split('@')[0];
    removeSudo(number);
    await sock.sendMessage(chatJid, { text: `✅ @${number} retiré des sudo.`, mentions: [target] }, { quoted: msg });
  },
};
