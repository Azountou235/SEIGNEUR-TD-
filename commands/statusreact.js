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

    const sub = (args[0] || '').trim().toLowerCase();

    if (sub === 'off') {
      settingsStore.set('autolike', false);
      await sock.sendMessage(chatJid, { text: '❌ Réaction automatique aux statuts désactivée.' }, { quoted: msg });
      return;
    }

    if (sub === 'on') {
      settingsStore.set('autolike', true);
      await sock.sendMessage(chatJid, { text: `✅ Réaction automatique aux statuts activée (mode ${describeMode()}).` }, { quoted: msg });
      return;
    }

    if (sub === 'simple') {
      const emoji = args.slice(1).join(' ').trim();
      if (!emoji) {
        await sock.sendMessage(chatJid, { text: '⚠️ Merci de fournir un ou plusieurs emojis, ex. .statusreact simple 😂' }, { quoted: msg });
        return;
      }
      settingsStore.set('autolikeMode', 'simple');
      settingsStore.set('autolikeEmoji', emoji);
      const enabled = settingsStore.get('autolike', false);
      await sock.sendMessage(chatJid, { text: `✨ Emoji réglé sur ${emoji} (mode simple).\n\nActuellement *${enabled ? 'ON' : 'OFF'}* — utilisez .statusreact on pour activer.` }, { quoted: msg });
      return;
    }

    if (sub === 'hasard') {
      const raw = args.slice(1).join(' ').trim();
      if (!raw) {
        await sock.sendMessage(chatJid, { text: '⚠️ Merci de fournir des emojis séparés par des virgules, ex. .statusreact hasard 😂,😍,🔥' }, { quoted: msg });
        return;
      }
      const list = raw.split(',').map((e) => e.trim()).filter(Boolean);
      if (!list.length) {
        await sock.sendMessage(chatJid, { text: '⚠️ Aucun emoji valide détecté. Séparez-les par des virgules, ex. .statusreact hasard 😂,😍,🔥' }, { quoted: msg });
        return;
      }
      settingsStore.set('autolikeMode', 'hasard');
      settingsStore.set('autolikeEmojiList', list);
      const enabled = settingsStore.get('autolike', false);
      await sock.sendMessage(chatJid, { text: `✨ Liste hasard réglée sur : ${list.join(' ')}\n\nActuellement *${enabled ? 'ON' : 'OFF'}* — utilisez .statusreact on pour activer.` }, { quoted: msg });
      return;
    }

    // Rétrocompatibilité : .statusreact <emoji(s)> sans mot-clé = comportement "simple" (ancien comportement)
    if (sub) {
      const emoji = args.join(' ').trim();
      settingsStore.set('autolikeMode', 'simple');
      settingsStore.set('autolikeEmoji', emoji);
      const enabled = settingsStore.get('autolike', false);
      await sock.sendMessage(chatJid, { text: `✨ Emoji réglé sur ${emoji} (mode simple).\n\nActuellement *${enabled ? 'ON' : 'OFF'}* — utilisez .statusreact on pour activer.` }, { quoted: msg });
      return;
    }

    const enabled = settingsStore.get('autolike', false);
    await sock.sendMessage(chatJid, {
      text: `😊 *Réaction auto aux statuts* : ${enabled ? 'ON ✅' : 'OFF ❌'} — mode ${describeMode()}\n\nUsage :\n.statusreact simple <emoji>\n.statusreact hasard <emoji1,emoji2,emoji3>\n.statusreact on\n.statusreact off`,
    }, { quoted: msg });

    function describeMode() {
      const mode = settingsStore.get('autolikeMode', 'simple');
      if (mode === 'hasard') {
        const list = settingsStore.get('autolikeEmojiList', []);
        return list.length ? `hasard : ${list.join(' ')}` : 'hasard (aucune liste définie, emoji aléatoire par défaut)';
      }
      const emoji = settingsStore.get('autolikeEmoji', null);
      return emoji ? `simple (${emoji})` : 'simple (emoji aléatoire par défaut)';
    }
  },
};
