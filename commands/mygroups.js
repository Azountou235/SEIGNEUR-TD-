const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'mygroups',
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut faire ça.' }, { quoted: msg });
      return;
    }
    try {
      await sock.sendMessage(chatJid, { text: '📋 Récupération des groupes...' }, { quoted: msg });
      const groups = await sock.groupFetchAllParticipating();
      const list = Object.values(groups).sort((a, b) => b.participants.length - a.participants.length);
      if (!list.length) {
        await sock.sendMessage(chatJid, { text: '📋 Le bot n’est dans aucun groupe.' }, { quoted: msg });
        return;
      }
      const rows = list.map((g, i) => `${i + 1}. *${g.subject}*\n   👥 ${g.participants.length} membres — 🆔 ${g.id.split('@')[0]}`).join('\n\n');
      await sock.sendMessage(chatJid, { text: `🏘️ *Mes groupes* (${list.length})\n\n${rows}` }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
