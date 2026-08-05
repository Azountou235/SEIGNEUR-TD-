const { resolveChannel } = require('../utils/resolveChannel');

module.exports = {
  name: 'channeljid',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const input = args.join(' ').trim();

    if (!input) {
      await sock.sendMessage(chatJid, { text: '⚠️ Usage : .channeljid <lien ou jid de la chaîne>\nExemple : .channeljid https://whatsapp.com/channel/xxxxx' }, { quoted: msg });
      return;
    }

    const resolved = await resolveChannel(sock, input);
    if (!resolved) {
      await sock.sendMessage(chatJid, { text: '❌ Chaîne introuvable. Vérifiez le lien/JID.' }, { quoted: msg });
      return;
    }

    await sock.sendMessage(chatJid, { text: `📰 *${resolved.name}*\n🆔 ${resolved.jid}` }, { quoted: msg });
  },
};
