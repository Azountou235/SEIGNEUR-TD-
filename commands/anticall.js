const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'anticall',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }
    const choice = (args[0] || '').toLowerCase();
    if (choice !== 'on' && choice !== 'off') {
      const current = settingsStore.get('anticall', false);
      await sock.sendMessage(chatJid, { text: `Anticall est actuellement : *${current ? 'on' : 'off'}*\n(rejette automatiquement les appels entrants)\n\nUsage : .anticall on | off` }, { quoted: msg });
      return;
    }
    settingsStore.set('anticall', choice === 'on');
    await sock.sendMessage(chatJid, { text: `✅ Anticall réglé sur *${choice}*.` }, { quoted: msg });
  },
};
