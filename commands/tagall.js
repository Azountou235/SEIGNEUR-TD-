module.exports = {
  name: 'tagall',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!chatJid.endsWith('@g.us')) {
      await sock.sendMessage(chatJid, { text: '⚠️ Cette commande ne fonctionne que dans un groupe.' }, { quoted: msg });
      return;
    }

    try {
      const metadata = await sock.groupMetadata(chatJid);
      const participants = metadata.participants.map((p) => p.id);
      const customText = args.join(' ');

      const text = `📢 *${customText || 'Attention à tous !'}*\n\n` +
        participants.map((p) => `@${p.split('@')[0]}`).join('\n');

      await sock.sendMessage(chatJid, { text, mentions: participants }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
