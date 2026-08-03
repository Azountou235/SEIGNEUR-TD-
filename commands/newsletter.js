const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'newsletter',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const newsletterJid = settingsStore.get('newsletter', null);
    if (!newsletterJid) {
      await sock.sendMessage(chatJid, { text: '❌ Aucune chaîne réglée. Utilisez .setnewsletter <lien>.' }, { quoted: msg });
      return;
    }
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'unfollow') {
      if (!isOwner(msg)) {
        await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut faire ça.' }, { quoted: msg });
        return;
      }
      try {
        await sock.newsletterUnfollow(newsletterJid);
        settingsStore.set('newsletter', null);
        await sock.sendMessage(chatJid, { text: '✅ Désabonné de la chaîne.' }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
      }
      return;
    }
    try {
      const metadata = await sock.newsletterMetadata('jid', newsletterJid);
      const name = metadata?.name || metadata?.subject || 'Inconnu';
      const desc = metadata?.description || 'Aucune description';
      const subs = metadata?.subscriberCount ?? metadata?.subscribers ?? 'inconnu';
      await sock.sendMessage(chatJid, {
        text: `📰 *${name}*\n👥 Abonnés : ${subs}\n🆔 ${newsletterJid}\n\n📝 ${desc}\n\n.newsletter unfollow — se désabonner`,
      }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
