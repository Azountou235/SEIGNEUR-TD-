const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'setnewsletter',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut faire ça.' }, { quoted: msg });
      return;
    }
    const input = args.join(' ').trim();
    if (!input) {
      await sock.sendMessage(chatJid, { text: '⚠️ Usage : .setnewsletter <lien ou JID de la chaîne>' }, { quoted: msg });
      return;
    }
    try {
      let newsletterJid, metadata;
      if (input.endsWith('@newsletter')) {
        newsletterJid = input;
        metadata = await sock.newsletterMetadata('jid', newsletterJid);
      } else {
        const code = input.includes('/channel/') ? input.split('/channel/')[1].split(/[/?]/)[0] : input;
        metadata = await sock.newsletterMetadata('invite', code);
        newsletterJid = metadata?.id;
      }
      if (!metadata || !newsletterJid) {
        await sock.sendMessage(chatJid, { text: '❌ Chaîne introuvable. Vérifiez le lien/JID.' }, { quoted: msg });
        return;
      }
      await sock.newsletterFollow(newsletterJid);
      settingsStore.set('newsletter', newsletterJid);
      const name = metadata.name || metadata.subject || 'Inconnu';
      await sock.sendMessage(chatJid, { text: `✅ Abonné à *${name}*\n🆔 ${newsletterJid}\n\nUtilisez .newsletter pour voir les infos.` }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
