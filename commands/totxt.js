const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'totxt',
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut utiliser cette commande.' }, { quoted: msg });
      return;
    }
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg) {
      await sock.sendMessage(chatJid, { text: '📄 Répondez à un message avec *.totxt* pour le convertir en fichier .txt (sans limite de longueur).' }, { quoted: msg });
      return;
    }

    const extractedText =
      quotedMsg.conversation ||
      quotedMsg.extendedTextMessage?.text ||
      quotedMsg.imageMessage?.caption ||
      quotedMsg.videoMessage?.caption ||
      quotedMsg.documentMessage?.caption ||
      '';

    if (!extractedText.trim()) {
      await sock.sendMessage(chatJid, { text: '❌ Ce message ne contient pas de texte à convertir.' }, { quoted: msg });
      return;
    }

    try {
      const buffer = Buffer.from(extractedText, 'utf-8');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      await sock.sendMessage(chatJid, { document: buffer, mimetype: 'text/plain', fileName: `totxt-${stamp}.txt` }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
