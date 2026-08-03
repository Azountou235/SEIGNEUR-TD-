const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'setfont',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }
    const font = (args[0] || '').trim();
    if (!font) {
      await sock.sendMessage(chatJid, { text: '⚠️ Usage : .setfont <default|bold|italic|fancy>' }, { quoted: msg });
      return;
    }
    settingsStore.set('font', font);
    await sock.sendMessage(chatJid, { text: `✅ Police enregistrée : ${font}` }, { quoted: msg });
  },
};
