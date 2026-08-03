const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'autorecord',
  aliases: ['autorecording'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }

    const choice = (args[0] || '').toLowerCase();
    if (choice !== 'on' && choice !== 'off') {
      const current = settingsStore.get('autorecording', false);
      await sock.sendMessage(chatJid, { text: `🎙️ Auto-recording est actuellement *${current ? 'on' : 'off'}*.\n\nUsage : .autorecord on | off` }, { quoted: msg });
      return;
    }

    settingsStore.set('autorecording', choice === 'on');
    await sock.sendMessage(chatJid, { text: `✅ Auto-recording réglé sur *${choice}*.` }, { quoted: msg });
  },
};
