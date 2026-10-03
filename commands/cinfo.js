// .cinfo — informations détaillées sur le chat courant (privé ou groupe)
module.exports = {
  name: 'cinfo',
  description: 'Affiche des informations sur le chat courant.',
  execute: async (sock, msg) => {
    const jid = msg.key.remoteJid;
    try {
      if (jid.endsWith('@g.us')) {
        const m = await sock.groupMetadata(jid);
        const admins = m.participants.filter((p) => p.admin).length;
        const text =
          `ℹ️ *Infos du groupe*\n\n` +
          `📛 *Nom :* ${m.subject}\n` +
          `🆔 *JID :* ${jid}\n` +
          `👥 *Membres :* ${m.participants.length}\n` +
          `👑 *Admins :* ${admins}\n` +
          `📅 *Créé le :* ${m.creation ? new Date(m.creation * 1000).toLocaleString('fr-FR') : 'Inconnu'}\n` +
          (m.desc ? `📝 *Description :* ${m.desc}` : '');
        await sock.sendMessage(jid, { text }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, { text: `ℹ️ *Infos du chat*\n\n🆔 *JID :* ${jid}\n💬 *Type :* Conversation privée` }, { quoted: msg });
      }
    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ Erreur : ${error.message}` }, { quoted: msg });
    }
  },
};
