const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

const DEFAULT_MESSAGE = "🚫 Anticall activé, je ne peux pas recevoir d'appels pour le moment !";

module.exports = {
  name: 'anticall',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }

    const sub = (args[0] || '').toLowerCase();

    // .anticall message <texte>  → définit le message envoyé à l'appelant
    // après le rejet automatique de son appel.
    if (sub === 'message' || sub === 'msg') {
      const text = args.slice(1).join(' ').trim();
      if (!text) {
        const currentMsg = settingsStore.get('anticallMessage', DEFAULT_MESSAGE);
        await sock.sendMessage(
          chatJid,
          { text: `Message anticall actuel :\n"${currentMsg}"\n\nUsage : .anticall message <texte>` },
          { quoted: msg }
        );
        return;
      }
      settingsStore.set('anticallMessage', text);
      await sock.sendMessage(
        chatJid,
        { text: `✅ Message anticall enregistré :\n"${text}"` },
        { quoted: msg }
      );
      return;
    }

    if (sub !== 'on' && sub !== 'off') {
      const current = settingsStore.get('anticall', false);
      const currentMsg = settingsStore.get('anticallMessage', DEFAULT_MESSAGE);
      await sock.sendMessage(
        chatJid,
        {
          text:
            `Anticall est actuellement : *${current ? 'on' : 'off'}*\n` +
            `(rejette automatiquement les appels entrants, dès réception, avant tout autre traitement)\n\n` +
            `Message envoyé à l'appelant après rejet :\n"${currentMsg}"\n\n` +
            `Usage :\n.anticall on | off\n.anticall message <texte>`,
        },
        { quoted: msg }
      );
      return;
    }

    settingsStore.set('anticall', sub === 'on');
    await sock.sendMessage(chatJid, { text: `✅ Anticall réglé sur *${sub}*.` }, { quoted: msg });
  },
};
