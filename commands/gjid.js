// .gjid — donne le JID du groupe courant
module.exports = {
  name: 'gjid',
  description: "Donne l'identifiant (JID) du groupe courant.",
  execute: async (sock, msg) => {
    const jid = msg.key.remoteJid;
    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: '❌ Cette commande ne fonctionne que dans un groupe.' }, { quoted: msg });
      return;
    }
    await sock.sendMessage(jid, { text: `🆔 *JID du groupe :*\n${jid}` }, { quoted: msg });
  },
};
