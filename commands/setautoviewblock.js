const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'setautoviewblock',
  aliases: ['autoviewblock'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }

    const sub = (args[0] || '').toLowerCase();
    const list = settingsStore.get('autoviewBlock', []);

    if (sub === 'list') {
      await sock.sendMessage(chatJid, { text: list.length ? `🚫 Bloqués de l'auto-view :\n${list.join('\n')}` : 'Aucun numéro bloqué.' }, { quoted: msg });
      return;
    }

    const number = (args[1] || '').replace(/[^0-9]/g, '');

    if ((sub === 'add' || sub === 'remove') && !number) {
      await sock.sendMessage(chatJid, { text: '⚠️ Merci de fournir un numéro, ex. .setautoviewblock add 23591234567' }, { quoted: msg });
      return;
    }

    if (sub === 'add') {
      if (!list.includes(number)) list.push(number);
      settingsStore.set('autoviewBlock', list);
      await sock.sendMessage(chatJid, { text: `✅ ${number} ajouté à la liste de blocage auto-view.` }, { quoted: msg });
    } else if (sub === 'remove') {
      settingsStore.set('autoviewBlock', list.filter((n) => n !== number));
      await sock.sendMessage(chatJid, { text: `✅ ${number} retiré de la liste de blocage auto-view.` }, { quoted: msg });
    } else {
      await sock.sendMessage(chatJid, { text: 'Usage :\n.setautoviewblock add <numéro>\n.setautoviewblock remove <numéro>\n.setautoviewblock list' }, { quoted: msg });
    }
  },
};
m
