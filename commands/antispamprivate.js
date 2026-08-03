const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'antispamprivate',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }

    const sub = (args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(sub)) {
      const current = settingsStore.get('antispamprivate', false) ? 'on' : 'off';
      await sock.sendMessage(chatJid, {
        text: `Antispamprivate est actuellement : *${current}*\n(supprime les messages puis bloque quiconque envoie en privé un média très lourd ou un texte anormalement long)\n\nUsage : .antispamprivate on | off`,
      }, { quoted: msg });
      return;
    }

    settingsStore.set('antispamprivate', sub === 'on');
    await sock.sendMessage(chatJid, { text: `✅ Antispamprivate réglé sur *${sub}*.` }, { quoted: msg });
  },
};
