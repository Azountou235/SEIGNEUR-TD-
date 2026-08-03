const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'mode',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer le mode du bot.' }, { quoted: msg });
      return;
    }

    const choice = (args[0] || '').toLowerCase();

    if (choice !== 'public' && choice !== 'private') {
      const current = settingsStore.get('mode', 'public');
      await sock.sendMessage(chatJid, { text: `⚙️ Mode actuel : *${current}*\n\nUsage : .mode public | .mode private` }, { quoted: msg });
      return;
    }

    settingsStore.set('mode', choice);
    await sock.sendMessage(chatJid, { text: `✅ Bot mode set to *${choice}*.` }, { quoted: msg });
  },
};
