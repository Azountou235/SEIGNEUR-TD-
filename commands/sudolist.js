const { listSudo } = require('../utils/isSudo');

module.exports = {
  name: 'sudolist',
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;
    const list = listSudo();
    if (!list.length) {
      await sock.sendMessage(chatJid, { text: '📋 Aucun sudo pour le moment.' }, { quoted: msg });
      return;
    }
    const mentions = list.map((n) => `${n}@s.whatsapp.net`);
    await sock.sendMessage(chatJid, {
      text: `👑 *Liste des sudo*\n\n${list.map((n) => `• @${n}`).join('\n')}`,
      mentions,
    }, { quoted: msg });
  },
};
