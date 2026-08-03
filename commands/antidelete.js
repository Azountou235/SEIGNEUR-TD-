const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'antidelete',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }

    const first = (args[0] || '').toLowerCase();

    // Nouvelle syntaxe combinée : .antidelete chat on|off  /  .antidelete private on|off
    // "chat"    -> renvoie le média/message supprimé dans le chat/groupe d'origine (dest = g)
    // "private" -> renvoie le média/message supprimé en privé, au bot lui-même (dest = p)
    if (first === 'chat' || first === 'private') {
      const state = (args[1] || '').toLowerCase();
      if (state !== 'on' && state !== 'off') {
        await sock.sendMessage(chatJid, { text: `⚠️ Usage : .antidelete ${first} on | off` }, { quoted: msg });
        return;
      }
      settingsStore.set('antidelete', state === 'on');
      settingsStore.set('antideleteDest', first === 'chat' ? 'g' : 'p');
      await sock.sendMessage(chatJid, {
        text: `✅ Antidelete réglé sur *${state}* — destination : *${first === 'chat' ? 'chat/groupe d\'origine' : 'privé (bot)'}*.`,
      }, { quoted: msg });
      return;
    }

    // Ancienne syntaxe : .antidelete on|off (garde la destination actuelle)
    if (first !== 'on' && first !== 'off') {
      const current = settingsStore.get('antidelete', false);
      const dest = settingsStore.get('antideleteDest', 'p');
      await sock.sendMessage(chatJid, {
        text: `Antidelete est actuellement : *${current ? 'on' : 'off'}*\n📍 Destination : *${dest === 'g' ? 'chat/groupe d\'origine' : 'privé (bot)'}*\n\nUsage :\n.antidelete chat on | off — renvoie dans le chat d'origine\n.antidelete private on | off — renvoie en privé au bot`,
      }, { quoted: msg });
      return;
    }

    settingsStore.set('antidelete', first === 'on');
    await sock.sendMessage(chatJid, { text: `✅ Antidelete réglé sur *${first}*.` }, { quoted: msg });
  },
};
