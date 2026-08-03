const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'setautoreactemoji',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }

    const emoji = args[0];
    if (!emoji) {
      await sock.sendMessage(chatJid, { text: '😄 Usage : .setautoreactemoji <emoji>\n(ex. .setautoreactemoji 🔥)' }, { quoted: msg });
      return;
    }

    settingsStore.set('autoreactEmoji', emoji);
    await sock.sendMessage(chatJid, { text: `✅ Emoji auto-react réglé sur ${emoji}` }, { quoted: msg });
  },
};
