const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'antibot',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }
    const choice = (args[0] || '').toLowerCase();
    if (choice !== 'on' && choice !== 'off') {
      const current = settingsStore.get('antibot', false);
      await sock.sendMessage(chatJid, { text: `🤖 Antibot est actuellement : *${current ? 'on' : 'off'}*\n(expulse les non-admins qui utilisent un préfixe de commande dans les groupes)\n\nUsage : .antibot on | off` }, { quoted: msg });
      return;
    }
    settingsStore.set('antibot', choice === 'on');
    await sock.sendMessage(chatJid, { text: `✅ Antibot réglé sur *${choice}*.` }, { quoted: msg });
  },
};
