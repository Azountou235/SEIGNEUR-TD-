const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'setprofile',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer la bio du bot.' }, { quoted: msg });
      return;
    }
    const bio = args.join(' ').trim();
    if (!bio) {
      await sock.sendMessage(chatJid, { text: '⚠️ Usage : .setprofile <texte>' }, { quoted: msg });
      return;
    }
    try {
      await sock.updateProfileStatus(bio);
      await sock.sendMessage(chatJid, { text: `✅ Bio du bot mise à jour : ${bio}` }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
