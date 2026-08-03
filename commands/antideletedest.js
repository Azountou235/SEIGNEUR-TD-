const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'antideletedest',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }
    const choice = (args[0] || '').toLowerCase();
    if (choice !== 'p' && choice !== 'g') {
      const current = settingsStore.get('antideleteDest', 'p');
      await sock.sendMessage(chatJid, { text: `📍 Destination antidelete actuelle : *${current}*\n(pour antiedit, utilisez plutôt : .antiedit chat on|off ou .antiedit private on|off)\n\nUsage :\n.antideletedest p — envoie en privé (au bot)\n.antideletedest g — renvoie dans le groupe/chat d'origine` }, { quoted: msg });
      return;
    }
    settingsStore.set('antideleteDest', choice);
    await sock.sendMessage(chatJid, { text: `✅ Destination antidelete réglée sur *${choice}*.` }, { quoted: msg });
  },
};
