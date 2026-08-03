const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'autostatusview',
  aliases: ['autoview'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }

    const choice = (args[0] || '').toLowerCase();
    if (choice !== 'on' && choice !== 'off') {
      const current = settingsStore.get('autoview', true);
      await sock.sendMessage(chatJid, { text: `👁️ Auto status view est actuellement *${current ? 'on' : 'off'}*.\n\nUsage : .autostatusview on | off` }, { quoted: msg });
      return;
    }

    settingsStore.set('autoview', choice === 'on');
    await sock.sendMessage(chatJid, { text: `✅ Auto status view réglé sur *${choice}*.` }, { quoted: msg });
  },
};
