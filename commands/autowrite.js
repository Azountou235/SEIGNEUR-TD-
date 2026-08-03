const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'autowrite',
  aliases: ['autotyping'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }

    const choice = (args[0] || '').toLowerCase();
    if (choice !== 'on' && choice !== 'off') {
      const current = settingsStore.get('autotyping', false);
      await sock.sendMessage(chatJid, { text: `⌨️ Auto-typing est actuellement *${current ? 'on' : 'off'}*.\n\nUsage : .autowrite on | off` }, { quoted: msg });
      return;
    }

    settingsStore.set('autotyping', choice === 'on');
    await sock.sendMessage(chatJid, { text: `✅ Auto-typing réglé sur *${choice}*.` }, { quoted: msg });
  },
};
