const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'auto',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }

    const state = (args[0] || '').toLowerCase();
    if (state !== 'on' && state !== 'off') {
      const current = settingsStore.get('autoViewOnce', false);
      await sock.sendMessage(chatJid, {
        text: `⚠️ Usage : .auto on | off\n\nÉtat actuel : ${current ? '✅ activé' : '❌ désactivé'}\n\nQuand c'est activé, chaque photo/vidéo/vocal à vue unique reçu est automatiquement envoyé en privé au owner, sans avoir besoin de répondre avec *.cool*.`,
      }, { quoted: msg });
      return;
    }

    settingsStore.set('autoViewOnce', state === 'on');
    await sock.sendMessage(chatJid, {
      text: state === 'on'
        ? '✅ Envoi automatique des vues uniques activé. Chaque vue unique reçue sera envoyée en privé dès son arrivée.'
        : '❌ Envoi automatique désactivé. Utilise *.cool* en réponse à une vue unique pour la récupérer manuellement.',
    }, { quoted: msg });
  },
};
