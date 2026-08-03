const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'setbotname',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer le nom du bot.' }, { quoted: msg });
      return;
    }
    const name = args.join(' ').trim();
    if (!name) {
      await sock.sendMessage(chatJid, { text: '⚠️ Usage : .setbotname <nom>' }, { quoted: msg });
      return;
    }
    settingsStore.set('botName', name);
    try {
      await sock.updateProfileName(name);
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `⚠️ Enregistré, mais échec de mise à jour du profil WhatsApp : ${e.message}` }, { quoted: msg });
      return;
    }
    await sock.sendMessage(chatJid, { text: `✅ Nom du bot réglé sur : ${name}` }, { quoted: msg });
  },
};
