const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'setstatusemoji',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }

    const emoji = args[0];
    if (!emoji) {
      settingsStore.set('autolikeEmoji', null);
      await sock.sendMessage(chatJid, { text: '✅ Retour aux réactions emoji aléatoires sur les statuts.' }, { quoted: msg });
      return;
    }

    settingsStore.set('autolikeEmoji', emoji);
    await sock.sendMessage(chatJid, { text: `✅ Emoji auto-react des statuts réglé sur ${emoji}\n(ne s'applique que si .autolike est activé)` }, { quoted: msg });
  },
};
