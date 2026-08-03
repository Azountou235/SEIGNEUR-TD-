const { isOwner } = require('../utils/isOwner');
const { isSenderAdmin } = require('../utils/isAdmin');
const groupSettingsStore = require('../utils/groupSettingsStore');

module.exports = {
  name: 'antiaudio',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!chatJid.endsWith('@g.us')) {
      await sock.sendMessage(chatJid, { text: '⚠️ Cette commande ne fonctionne que dans un groupe.' }, { quoted: msg });
      return;
    }
    const senderJid = msg.key.participant || chatJid;
    const metadata = await sock.groupMetadata(chatJid);
    if (!isOwner(msg) && !isSenderAdmin(metadata, senderJid)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul un admin du groupe peut utiliser cette commande.' }, { quoted: msg });
      return;
    }

    const sub = (args[0] || '').toLowerCase();
    if (!['off', 'delete', 'warn', 'kick'].includes(sub)) {
      const current = groupSettingsStore.get(chatJid, 'antiaudio', 'off');
      await sock.sendMessage(chatJid, {
        text: `Antiaudio est actuellement : *${current}*\n\nUsage :\n.antiaudio off — désactivé\n.antiaudio delete — supprime le message\n.antiaudio warn — avertit puis expulse après 3\n.antiaudio kick — expulse directement`,
      }, { quoted: msg });
      return;
    }

    groupSettingsStore.set(chatJid, 'antiaudio', sub);
    await sock.sendMessage(chatJid, { text: `✅ Antiaudio réglé sur *${sub}*.` }, { quoted: msg });
  },
};
