const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'unblock',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut débloquer un contact.' }, { quoted: msg });
      return;
    }
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
    const digits = (args[0] || '').replace(/[^0-9]/g, '');
    const isDM = !chatJid.endsWith('@g.us');
    const target = mentioned || quoted || (digits ? `${digits}@s.whatsapp.net` : null) || (isDM ? chatJid : null);

    if (!target) {
      await sock.sendMessage(chatJid, { text: '⚠️ Usage : .unblock @personne ou .unblock <numéro>\n(En privé, .unblock seul débloque cette discussion.)' }, { quoted: msg });
      return;
    }
    try {
      await sock.updateBlockStatus(target, 'unblock');
      await sock.sendMessage(chatJid, { text: `✅ @${target.split('@')[0]} débloqué.`, mentions: [target] }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
