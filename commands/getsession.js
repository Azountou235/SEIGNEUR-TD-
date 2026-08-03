const config = require('../config/config');

module.exports = {
  name: 'getsession',
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;
    await sock.sendMessage(chatJid, {
      text: `🔐 *Session*\n📦 Dossier : ${config.authFolder}\n✅ Statut : Connecté\n👤 Numéro : ${sock.user?.id?.split(':')[0] || 'inconnu'}`,
    }, { quoted: msg });
  },
};
