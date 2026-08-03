const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'setownernumber',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut faire ça.' }, { quoted: msg });
      return;
    }
    const num = (args[0] || '').replace(/[^0-9]/g, '');
    if (!num) {
      await sock.sendMessage(chatJid, { text: '⚠️ Usage : .setownernumber <numéro>\nExemple : .setownernumber 23591234567' }, { quoted: msg });
      return;
    }
    settingsStore.set('ownerNumber', num);
    await sock.sendMessage(chatJid, { text: `✅ Numéro du owner mis à jour : ${num}\n\n⚠️ Envoyez la prochaine commande depuis ce numéro, sinon vous perdrez l'accès owner.` }, { quoted: msg });
  },
};
