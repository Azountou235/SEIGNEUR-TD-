module.exports = {
  name: 'infogroup',
  aliases: ['groupinfo'],
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;

    if (!chatJid.endsWith('@g.us')) {
      await sock.sendMessage(chatJid, { text: '⚠️ Cette commande ne fonctionne que dans un groupe.' }, { quoted: msg });
      return;
    }

    try {
      const metadata = await sock.groupMetadata(chatJid);
      const admins = metadata.participants.filter((p) => p.admin).map((p) => `@${p.id.split('@')[0]}`);
      const createdDate = new Date(metadata.creation * 1000).toLocaleDateString('fr-FR');

      const text = `📋 *Infos du groupe*\n\n` +
        `*Nom :* ${metadata.subject}\n` +
        `*Description :* ${metadata.desc || 'Aucune'}\n` +
        `*Membres :* ${metadata.participants.length}\n` +
        `*Créé le :* ${createdDate}\n` +
        `*Admins (${admins.length}) :*\n${admins.join('\n') || 'Aucun'}`;

      await sock.sendMessage(chatJid, { text, mentions: metadata.participants.filter((p) => p.admin).map((p) => p.id) }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
