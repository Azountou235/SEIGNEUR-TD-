const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'setownername',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut faire ça.' }, { quoted: msg });
      return;
    }
    const name = args.join(' ').trim();
    if (!name) {
      await sock.sendMessage(chatJid, { text: '⚠️ Usage : .setownername <nom>' }, { quoted: msg });
      return;
    }
    settingsStore.set('ownerName', name);
    await sock.sendMessage(chatJid, { text: `✅ Nom du owner réglé sur : ${name}` }, { quoted: msg });
  },
};
