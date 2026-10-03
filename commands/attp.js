// .attp — autocollant animé à partir d'un texte (API publique lolhuman)
module.exports = {
  name: 'attp',
  description: 'Crée un autocollant animé à partir de ton texte. Usage : .attp <texte>',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const text = args.join(' ').trim();
    if (!text) {
      await sock.sendMessage(jid, { text: '❌ Usage : .attp <texte>' }, { quoted: msg });
      return;
    }
    try {
      await sock.sendMessage(
        jid,
        { sticker: { url: `https://api.lolhuman.xyz/api/attp?apikey=cde5404984da80591a2692b6&text=${encodeURIComponent(text)}` } },
        { quoted: msg }
      );
    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ Échec de la création de l'autocollant : ${error.message}` }, { quoted: msg });
    }
  },
};
