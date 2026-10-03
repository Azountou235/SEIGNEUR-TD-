// .setstatus — publie un statut WhatsApp personnel (texte, image ou vidéo citée)
module.exports = {
  name: 'setstatus',
  description: 'Publie un statut WhatsApp. Usage : .setstatus <texte>, ou réponds à une image/vidéo.',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const text = args.join(' ').trim();

    try {
      if (quoted?.imageMessage) {
        await sock.sendMessage('status@broadcast', { image: quoted.imageMessage, caption: text || quoted.imageMessage.caption || '' });
      } else if (quoted?.videoMessage) {
        await sock.sendMessage('status@broadcast', { video: quoted.videoMessage, caption: text || quoted.videoMessage.caption || '' });
      } else if (text) {
        await sock.sendMessage('status@broadcast', { text, backgroundColor: '#075E54', font: 1 });
      } else {
        await sock.sendMessage(jid, { text: '📌 Usage :\n• .setstatus <texte>\n• Réponds à une image/vidéo avec .setstatus [légende]' }, { quoted: msg });
        return;
      }
      await sock.sendMessage(jid, { text: '✅ Statut publié.' }, { quoted: msg });
    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ Échec de la publication : ${error.message}` }, { quoted: msg });
    }
  },
};
