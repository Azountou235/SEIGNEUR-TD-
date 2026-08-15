const config = require('../config/config');

function isSuperAdmin(msg) {
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const senderNumber = senderJid.split('@')[0].split(':')[0];
  return config.reactNumbers.includes(senderNumber);
}

module.exports = {
  name: 'lydia',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!chatJid.endsWith('@g.us')) {
      await sock.sendMessage(chatJid, { text: '⚠️ Cette commande fonctionne uniquement dans un groupe.' }, { quoted: msg });
      return;
    }

    if (!isSuperAdmin(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seuls les super admins peuvent activer/désactiver Lydia.' }, { quoted: msg });
      return;
    }

    const state = (args[0] || '').toLowerCase();
    if (state !== 'on' && state !== 'off') {
      const lydiaStore = require('../utils/lydiaStore');
      const current = lydiaStore.isEnabled(chatJid);
      await sock.sendMessage(chatJid, { text: `⚠️ Usage : .lydia on | off\n\nÉtat actuel : ${current ? '✅ activée' : '❌ désactivée'}` }, { quoted: msg });
      return;
    }

    const lydiaStore = require('../utils/lydiaStore');
    const ownerNumber = config.reactNumbers[0] || config.ownerNumber;

    if (state === 'on') {
      lydiaStore.enable(chatJid);
      await sock.sendMessage(chatJid, {
        text: `✅ Lydia activée dans ce groupe.\n\n💬 Les super admins peuvent lui parler directement, sans rien mentionner.\n👥 Les autres doivent mentionner @${ownerNumber} pour qu'elle réponde (ex : "@${ownerNumber} salut cv").`,
        mentions: [`${ownerNumber}@s.whatsapp.net`],
      }, { quoted: msg });
    } else {
      lydiaStore.disable(chatJid);
      await sock.sendMessage(chatJid, { text: '❌ Lydia désactivée dans ce groupe.' }, { quoted: msg });
    }
  },
};
