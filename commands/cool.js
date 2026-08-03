const { isOwner } = require('../utils/isOwner');
const { grabViewOnce } = require('../utils/viewOnceGrab');

module.exports = {
  name: 'cool',
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut faire ça.' }, { quoted: msg });
      return;
    }
    const found = await grabViewOnce(sock, msg);
    if (!found) {
      await sock.sendMessage(chatJid, { text: '👁️ Répondez à une photo/vidéo/vocal à vue unique avec *.cool* (ou juste "cool") pour la récupérer en privé.' }, { quoted: msg });
    }
  },
};
