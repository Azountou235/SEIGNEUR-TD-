const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'antiedit',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }

    const first = (args[0] || '').toLowerCase();

    // Nouvelle syntaxe combinée : .antiedit chat on|off  /  .antiedit private on|off
    // "chat"    -> signale le message modifié dans le chat/groupe d'origine (dest = g)
    // "private" -> signale le message modifié en privé, au bot lui-même (dest = p)
    if (first === 'chat' || first === 'private') {
      const state = (args[1] || '').toLowerCase();
      if (state !== 'on' && state !== 'off') {
        await sock.sendMessage(chatJid, { text: `⚠️ Usage : .antiedit ${first} on | off` }, { quoted: msg });
        return;
      }
      settingsStore.set('antiedit', state === 'on');
      settingsStore.set('antieditDest', first === 'chat' ? 'g' : 'p');
      await sock.sendMessage(chatJid, {
        text: `✅ Antiedit réglé sur *${state}* — destination : *${first === 'chat' ? 'chat/groupe d\'origine' : 'privé (bot)'}*.`,
      }, { quoted: msg });
      return;
    }

    // Ancienne syntaxe : .antiedit on|off (garde la destination actuelle)
    if (first !== 'on' && first !== 'off') {
      const current = settingsStore.get('antiedit', false);
      const dest = settingsStore.get('antieditDest', 'p');
      await sock.sendMessage(chatJid, {
        text: `Antiedit est actuellement : *${current ? 'on' : 'off'}*\n📍 Destination : *${dest === 'g' ? 'chat/groupe d\'origine' : 'privé (bot)'}*\n\nUsage :\n.antiedit chat on | off — signale dans le chat d'origine\n.antiedit private on | off — signale en privé au bot`,
      }, { quoted: msg });
      return;
    }

    settingsStore.set('antiedit', first === 'on');
    await sock.sendMessage(chatJid, { text: `✅ Antiedit réglé sur *${first}*.` }, { quoted: msg });
  },
};
