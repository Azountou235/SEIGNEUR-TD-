const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'setmenuimage',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }

    const rawArg = args.join(' ').trim();
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quotedImg = ctx?.quotedMessage?.imageMessage;
    const ownImg = msg.message?.imageMessage;

    if (rawArg && /^https?:\/\//i.test(rawArg)) {
      try { await axios.head(rawArg, { timeout: 8000 }); } catch { /* certains serveurs bloquent HEAD, on continue */ }
      settingsStore.set('menuImage', rawArg);
      settingsStore.set('menuStyle', 'image');
      await sock.sendMessage(chatJid, { text: '✅ Image du menu réglée depuis le lien.\n📌 Style du menu activé sur *image*.' }, { quoted: msg });
      return;
    }

    if (!ownImg && !quotedImg) {
      await sock.sendMessage(chatJid, {
        text: 'Usage :\n• .setmenuimage <lien direct vers une image>\n• Répondez à une image avec .setmenuimage\n• Envoyez une image en légende avec .setmenuimage',
      }, { quoted: msg });
      return;
    }

    try {
      const wrapped = ownImg ? msg : { message: { imageMessage: quotedImg } };
      const buffer = await downloadMediaMessage(wrapped, 'buffer', {});
      const savePath = path.join(__dirname, '../config/menuImage.jpg');
      fs.writeFileSync(savePath, buffer);

      settingsStore.set('menuImage', savePath);
      settingsStore.set('menuStyle', 'image');
      await sock.sendMessage(chatJid, { text: '✅ Image du menu mise à jour.\n📌 Style du menu activé sur *image*.' }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
