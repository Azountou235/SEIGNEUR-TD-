// .antipromote — annule automatiquement les promotions admin faites par des non-admins/non-owner
const { isOwner } = require('../utils/isOwner');
const { isSenderAdmin, isBotAdmin } = require('../utils/isAdmin');
const groupSettingsStore = require('../utils/groupSettingsStore');

module.exports = {
  name: 'antipromote',
  description: "Annule automatiquement les promotions en admin faites sans autorisation.",
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!chatJid.endsWith('@g.us')) {
      await sock.sendMessage(chatJid, { text: '⚠️ Cette commande ne fonctionne que dans un groupe.' }, { quoted: msg });
      return;
    }
    const senderJid = msg.key.participant || chatJid;
    const metadata = await sock.groupMetadata(chatJid);
    if (!isOwner(msg) && !isSenderAdmin(metadata, senderJid)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul un admin peut utiliser cette commande.' }, { quoted: msg });
      return;
    }
    const sub = (args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(sub)) {
      const current = groupSettingsStore.get(chatJid, 'antipromote', false);
      await sock.sendMessage(chatJid, { text: `Antipromote est actuellement : *${current ? 'activé' : 'désactivé'}*\n\nUsage :\n.antipromote on\n.antipromote off` }, { quoted: msg });
      return;
    }
    const enabled = sub === 'on';
    groupSettingsStore.set(chatJid, 'antipromote', enabled);
    let text = `✅ Antipromote ${enabled ? 'activé' : 'désactivé'}.`;
    if (enabled && !isBotAdmin(sock, metadata)) {
      text += "\n\n⚠️ Je ne suis pas admin de ce groupe : je ne pourrai pas annuler les promotions tant que je ne le suis pas.";
    }
    await sock.sendMessage(chatJid, { text }, { quoted: msg });
  },
};
