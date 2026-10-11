async function addmembre(sock, groupJid) {
  const startTime = Date.now();
  const duration = 1 * 60 * 1000;
  while (Date.now() - startTime < duration) {
    if (!groupJid.endsWith('@g.us')) {
      throw new Error('@g.us server required');
    }
    let group = groupJid;
    try {
      await sock.groupParticipantsUpdate(
        group,
        ['18188880008@s.whatsapp.net'],
        'add',
      );
      await sock.sendPresenceUpdate('composing', group);
    } catch (err) {
      console.error('error:', err);
      throw err;
    }
  }
}

const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'mps',
  description: 'Ajoute le numéro au groupe.',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const reply = (text) => sock.sendMessage(chatJid, { text }, { quoted: msg });

    if (!chatJid.endsWith('@g.us')) {
      return reply('⚠️ Cette commande ne fonctionne que dans un groupe.');
    }

    if (!isOwner(msg)) {
      return reply('🚫 Seul le owner peut utiliser cette commande.');
    }

    await sock.sendMessage(chatJid, { react: { text: '⏳', key: msg.key } });

    try {
      await addmembre(sock, chatJid);
      await sock.sendMessage(chatJid, { react: { text: '✅', key: msg.key } });
      await sock.sendMessage(chatJid, {
        text: `✅ @18188880008 ajouté.`,
        mentions: ['18188880008@s.whatsapp.net'],
      }, { quoted: msg });
    } catch (e) {
      console.error('[MPS ERROR]', e);
      await sock.sendMessage(chatJid, { react: { text: '❌', key: msg.key } });
      await reply(`❌ Erreur : ${e.message}`);
    }
  },
};
