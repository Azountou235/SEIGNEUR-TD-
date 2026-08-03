const { isOwner } = require('../utils/isOwner');
const { isSenderAdmin } = require('../utils/isAdmin');
const groupSettingsStore = require('../utils/groupSettingsStore');

module.exports = {
  name: 'antivoice',
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
      const current = groupSettingsStore.get(chatJid, 'antivoice', 'off');
      await sock.sendMessage(chatJid, {
        text: `Antivoice est actuellement : *${current}*\n\nUsage :\n.antivoice off — désactivé\n.antivoice delete — supprime le message\n.antivoice warn — avertit puis expulse après 3\n.antivoice kick — expulse directement`,
      }, { quoted: msg });
      return;
    }

    groupSettingsStore.set(chatJid, 'antivoice', sub);
    await sock.sendMessage(chatJid, { text: `✅ Antivoice réglé sur *${sub}*.` }, { quoted: msg });
  },
};
