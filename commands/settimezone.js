const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'settimezone',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer le fuseau horaire.' }, { quoted: msg });
      return;
    }
    const tz = args.join(' ').trim();
    if (!tz) {
      await sock.sendMessage(chatJid, { text: '⚠️ Usage : .settimezone <fuseau>\nExemple : .settimezone Africa/Ndjamena' }, { quoted: msg });
      return;
    }
    settingsStore.set('timezone', tz);
    await sock.sendMessage(chatJid, { text: `✅ Fuseau horaire réglé sur : ${tz}` }, { quoted: msg });
  },
};
