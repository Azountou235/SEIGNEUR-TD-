module.exports = {
  name: 'getpp',
  aliases: ['pp', 'ppget'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;

    let targetJid = mentioned || quoted;

    if (!targetJid && args[0]) {
      const digits = args[0].replace(/[^0-9]/g, '');
      if (digits) targetJid = `${digits}@s.whatsapp.net`;
    }

    // Default: the group itself (if in a group) or the sender (in DM)
    if (!targetJid) {
      targetJid = chatJid.endsWith('@g.us')
        ? chatJid
        : (msg.key.participant || chatJid);
    }

    try {
      const url = await sock.profilePictureUrl(targetJid, 'image');
      await sock.sendMessage(
        chatJid,
        { image: { url }, caption: '📸 Profile picture' },
        { quoted: msg }
      );
    } catch (e) {
      await sock.sendMessage(
        chatJid,
        { text: '❌ Impossible de récupérer la photo de profil (peut-être qu\'aucune n\'est définie, ou que les réglages de confidentialité l\'empêchent).' },
        { quoted: msg }
      );
    }
  },
};
