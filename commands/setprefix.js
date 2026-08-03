const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'setprefix',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer le préfixe.' }, { quoted: msg });
      return;
    }
    const p = (args[0] || '').trim();
    if (!p) {
      await sock.sendMessage(chatJid, { text: '⚠️ Usage : .setprefix <symbole>\nExemple : .setprefix !' }, { quoted: msg });
      return;
    }
    settingsStore.set('prefix', p);
    await sock.sendMessage(chatJid, { text: `✅ Préfixe changé en : ${p}` }, { quoted: msg });
  },
};
