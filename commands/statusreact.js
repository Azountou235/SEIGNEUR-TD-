const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'statusreact',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }
    const arg = (args[0] || '').trim();
    const argLower = arg.toLowerCase();

    if (argLower === 'off') {
      settingsStore.set('autolike', false);
      await sock.sendMessage(chatJid, { text: '❌ Réaction automatique aux statuts désactivée.' }, { quoted: msg });
      return;
    }
    if (argLower === 'on') {
      settingsStore.set('autolike', true);
      const emoji = settingsStore.get('autolikeEmoji', null);
      await sock.sendMessage(chatJid, { text: `✅ Réaction automatique aux statuts activée${emoji ? ` (${emoji})` : ' (emoji aléatoire)'}.` }, { quoted: msg });
      return;
    }
    if (arg) {
      settingsStore.set('autolikeEmoji', arg);
      const enabled = settingsStore.get('autolike', false);
      await sock.sendMessage(chatJid, { text: `✨ Emoji réglé sur ${arg}.\n\nActuellement *${enabled ? 'ON' : 'OFF'}* — utilisez .statusreact on pour activer.` }, { quoted: msg });
      return;
    }

    const enabled = settingsStore.get('autolike', false);
    const emoji = settingsStore.get('autolikeEmoji', null);
    await sock.sendMessage(chatJid, {
      text: `😊 *Réaction auto aux statuts* : ${enabled ? `ON ✅ (${emoji || 'aléatoire'})` : 'OFF ❌'}\n\nUsage :\n.statusreact <emoji>\n.statusreact on\n.statusreact off`,
    }, { quoted: msg });
  },
};
