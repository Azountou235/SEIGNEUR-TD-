// .getprefix — rappelle le préfixe actuel du bot
const config = require('../config/config');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'getprefix',
  aliases: ['getp', 'prefix'],
  description: 'Affiche le préfixe actuel du bot.',
  execute: async (sock, msg) => {
    const jid = msg.key.remoteJid;
    const prefix = settingsStore.get('prefix', config.prefix);
    await sock.sendMessage(jid, { text: `🎯 Préfixe actuel : *${prefix}*` }, { quoted: msg });
  },
};
