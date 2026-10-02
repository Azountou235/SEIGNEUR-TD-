const { isOwner } = require('../utils/isOwner');
const { isSenderAdmin, isBotAdmin } = require('../utils/isAdmin');
const groupSettingsStore = require('../utils/groupSettingsStore');

// Le réglage est stocké sous la clé 'antigm' (lue par events/messages.js).
// Alias : .antigm / .antistatusmention
module.exports = {
  name: 'antigroupmention',
  aliases: ['antigm', 'antistatusmention'],
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
      const current = groupSettingsStore.get(chatJid, 'antigm', 'off');
      await sock.sendMessage(chatJid, {
        text: `Antigroupmention est actuellement : *${current}*\n\nSupprime les statuts qui mentionnent ce groupe.\n\nUsage :\n.antigroupmention off — désactivé\n.antigroupmention delete — supprime le statut mentionné\n.antigroupmention warn — supprime + avertit, expulse après 3\n.antigroupmention kick — supprime + expulse directement\n\n⚠️ Le bot doit être admin du groupe.`,
      }, { quoted: msg });
      return;
    }

    groupSettingsStore.set(chatJid, 'antigm', sub);

    let text = `✅ Antigroupmention réglé sur *${sub}*.`;
    if (sub !== 'off' && !isBotAdmin(sock, metadata)) {
      text += '\n\n⚠️ Je ne suis pas admin de ce groupe : je ne pourrai rien supprimer tant que je ne le suis pas.';
    }
    await sock.sendMessage(chatJid, { text }, { quoted: msg });
  },
};
