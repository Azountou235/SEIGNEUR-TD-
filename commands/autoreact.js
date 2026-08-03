const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'autoreact',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }

    const choice = (args[0] || '').toLowerCase();
    if (choice !== 'on' && choice !== 'off') {
      const current = settingsStore.get('autoreact', false);
      await sock.sendMessage(chatJid, { text: `😄 Auto-react est actuellement *${current ? 'on' : 'off'}*.\n\nUsage : .autoreact on | off\nDéfinissez l'emoji avec : .setautoreactemoji <emoji>` }, { quoted: msg });
      return;
    }

    settingsStore.set('autoreact', choice === 'on');
    await sock.sendMessage(chatJid, { text: `✅ Auto-react réglé sur *${choice}*.` }, { quoted: msg });
  },
};
