const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'antideletestatus',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }
    const choice = (args[0] || '').toLowerCase();
    if (choice !== 'on' && choice !== 'off') {
      const current = settingsStore.get('antideleteStatus', false);
      await sock.sendMessage(chatJid, { text: `Antidelete Status est actuellement : *${current ? 'on' : 'off'}*\n(renvoie en privé les statuts supprimés)\n\nUsage : .antideletestatus on | off` }, { quoted: msg });
      return;
    }
    settingsStore.set('antideleteStatus', choice === 'on');
    await sock.sendMessage(chatJid, { text: `✅ Antidelete Status réglé sur *${choice}*.` }, { quoted: msg });
  },
};
