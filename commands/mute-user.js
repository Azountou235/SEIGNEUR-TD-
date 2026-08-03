const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'mute-user',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut faire ça.' }, { quoted: msg });
      return;
    }
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
    const digits = (args[0] || '').replace(/[^0-9]/g, '');
    const target = mentioned || quoted || (digits ? `${digits}@s.whatsapp.net` : null);

    if (!target) {
      await sock.sendMessage(chatJid, { text: '⚠️ Mentionnez la personne, répondez à son message, ou écrivez son numéro devant *.mute-user*.' }, { quoted: msg });
      return;
    }
    const list = settingsStore.get('globalMuted', []);
    if (list.includes(target)) {
      await sock.sendMessage(chatJid, { text: `⚠️ @${target.split('@')[0]} est déjà muet.`, mentions: [target] }, { quoted: msg });
      return;
    }
    list.push(target);
    settingsStore.set('globalMuted', list);
    await sock.sendMessage(chatJid, { text: `🔇 @${target.split('@')[0]} est maintenant muet dans tous les groupes où le bot est admin.`, mentions: [target] }, { quoted: msg });
  },
};
