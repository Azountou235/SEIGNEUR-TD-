const { isOwner } = require('../utils/isOwner');
const { isSenderAdmin } = require('../utils/isAdmin');
const groupSettingsStore = require('../utils/groupSettingsStore');

module.exports = {
  name: 'antispamgroup',
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
    if (!['on', 'off'].includes(sub)) {
      const current = groupSettingsStore.get(chatJid, 'antispamgroup', 'off');
      await sock.sendMessage(chatJid, {
        text: `Antispamgroup est actuellement : *${current}*\n(supprime les messages + expulse quiconque envoie plus de 10 messages en moins d'une minute)\n\nUsage : .antispamgroup on | off`,
      }, { quoted: msg });
      return;
    }

    groupSettingsStore.set(chatJid, 'antispamgroup', sub);
    await sock.sendMessage(chatJid, { text: `✅ Antispamgroup réglé sur *${sub}*.` }, { quoted: msg });
  },
};
