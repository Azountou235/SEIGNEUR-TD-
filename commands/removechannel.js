const { isOwner } = require('../utils/isOwner');
const { resolveChannel } = require('../utils/resolveChannel');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'removechannel',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut faire ça.' }, { quoted: msg });
      return;
    }

    const input = args.join(' ').trim();
    if (!input) {
      const list = settingsStore.get('autoJoinChannels', []);
      await sock.sendMessage(chatJid, {
        text: list.length
          ? `📋 *Chaînes en auto-join :*\n${list.map((j, i) => `${i + 1}. ${j}`).join('\n')}\n\nUsage : .removechannel <jid ou lien>`
          : '📋 Aucune chaîne en auto-join.',
      }, { quoted: msg });
      return;
    }

    let targetJid = input.endsWith('@newsletter') ? input : null;
    if (!targetJid) {
      const resolved = await resolveChannel(sock, input);
      targetJid = resolved?.jid || null;
    }

    const list = settingsStore.get('autoJoinChannels', []);
    if (!targetJid || !list.includes(targetJid)) {
      await sock.sendMessage(chatJid, { text: '❌ Cette chaîne n\'est pas dans la liste d\'auto-join.' }, { quoted: msg });
      return;
    }

    settingsStore.set('autoJoinChannels', list.filter((j) => j !== targetJid));

    try {
      await sock.newsletterUnfollow(targetJid);
    } catch (e) {
      // déjà non suivi — sans gravité, elle est de toute façon retirée de la liste
    }

    await sock.sendMessage(chatJid, { text: `✅ Chaîne retirée de l'auto-join et désabonnée.\n🆔 ${targetJid}` }, { quoted: msg });
  },
};
