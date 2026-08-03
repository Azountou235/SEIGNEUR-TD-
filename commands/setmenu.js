const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'setmenu',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }
    const choice = (args[0] || '').toLowerCase();
    if (choice !== 'texte' && choice !== 'image') {
      const current = settingsStore.get('menuStyle', 'texte');
      await sock.sendMessage(chatJid, {
        text: `📋 Style du menu actuel : *${current}*\n\nUsage :\n.setmenu texte\n.setmenu image (nécessite .setmenuimage réglé avant)`,
      }, { quoted: msg });
      return;
    }
    if (choice === 'image' && !settingsStore.get('menuImage', null)) {
      await sock.sendMessage(chatJid, { text: '⚠️ Aucune image de menu réglée. Utilisez d’abord *.setmenuimage*.' }, { quoted: msg });
      return;
    }
    settingsStore.set('menuStyle', choice);
    await sock.sendMessage(chatJid, { text: `✅ Style du menu réglé sur : *${choice}*` }, { quoted: msg });
  },
};
