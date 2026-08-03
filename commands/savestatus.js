const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'savestatus',
  aliases: ['autosavestatus'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }
    const choice = (args[0] || '').toLowerCase();
    if (choice !== 'on' && choice !== 'off') {
      const current = settingsStore.get('saveStatus', false);
      await sock.sendMessage(chatJid, { text: `📥 Auto-sauvegarde des statuts : *${current ? 'on' : 'off'}*\n(chaque statut posté par vos contacts sera renvoyé en privé au bot)\n\nUsage : .savestatus on | off` }, { quoted: msg });
      return;
    }
    settingsStore.set('saveStatus', choice === 'on');
    await sock.sendMessage(chatJid, { text: `✅ Auto-sauvegarde des statuts réglée sur *${choice}*.` }, { quoted: msg });
  },
};
