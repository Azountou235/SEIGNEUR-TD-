const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'tostatus',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut publier sur le statut.' }, { quoted: msg });
      return;
    }

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const typedText = args.join(' ');

    const viewers = settingsStore.get('statusViewers', []);
    const statusOptions = viewers.length ? { statusJidList: viewers.map((n) => `${n}@s.whatsapp.net`) } : undefined;

    try {
      // 🖼️ IMAGE
      if (quoted?.imageMessage) {
        const buffer = await downloadMediaMessage({ message: { imageMessage: quoted.imageMessage } }, 'buffer', {});
        await sock.sendMessage('status@broadcast', { image: buffer, caption: quoted.imageMessage.caption || typedText || '' }, statusOptions);
        await sock.sendMessage(chatJid, { text: '✅ Statut 🖼️ Image publié.' }, { quoted: msg });
      }
      // 🎬 VIDEO
      else if (quoted?.videoMessage) {
        const buffer = await downloadMediaMessage({ message: { videoMessage: quoted.videoMessage } }, 'buffer', {});
        await sock.sendMessage('status@broadcast', { video: buffer, caption: quoted.videoMessage.caption || typedText || '' }, statusOptions);
        await sock.sendMessage(chatJid, { text: '✅ Statut 🎬 Vidéo publié.' }, { quoted: msg });
      }
      // 🎙️ VOICE NOTE (Note vocale PTT)
      else if (quoted?.audioMessage && quoted.audioMessage.ptt) {
        const buffer = await downloadMediaMessage({ message: { audioMessage: quoted.audioMessage } }, 'buffer', {});
        await sock.sendMessage('status@broadcast', { 
          audio: buffer, 
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true
        }, statusOptions);
        await sock.sendMessage(chatJid, { text: '✅ Statut 🎙️ Note vocale publiée.' }, { quoted: msg });
      }
      // 🔊 AUDIO FILE (Fichier audio normal)
      else if (quoted?.audioMessage && !quoted.audioMessage.ptt) {
        const buffer = await downloadMediaMessage({ message: { audioMessage: quoted.audioMessage } }, 'buffer', {});
        await sock.sendMessage('status@broadcast', { 
          audio: buffer, 
          mimetype: quoted.audioMessage.mimetype || 'audio/mpeg'
        }, statusOptions);
        await sock.sendMessage(chatJid, { text: '✅ Statut 🔊 Audio publié.' }, { quoted: msg });
      }
      // 📝 TEXT (Texte cité ou tapé)
      else if (quoted?.conversation || quoted?.extendedTextMessage?.text) {
        const text = quoted.conversation || quoted.extendedTextMessage.text;
        await sock.sendMessage('status@broadcast', { text }, statusOptions);
        await sock.sendMessage(chatJid, { text: '✅ Statut 📝 Texte publié.' }, { quoted: msg });
      }
      // 📝 TEXT (Texte tapé directement)
      else if (typedText) {
        await sock.sendMessage('status@broadcast', { text: typedText }, statusOptions);
        await sock.sendMessage(chatJid, { text: '✅ Statut 📝 Texte publié.' }, { quoted: msg });
      }
      // ❌ ERREUR
      else {
        await sock.sendMessage(chatJid, { 
          text: `📤 Utilisez *.tostatus* de cette manière:\n\n📝 Texte: *.tostatus Mon texte*\n🖼️  Image: Répondez à une image\n🎬 Vidéo: Répondez à une vidéo\n🎙️  Voice: Répondez à une note vocale\n🔊 Audio: Répondez à un fichier audio` 
        }, { quoted: msg });
        return;
      }
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Erreur: ${e.message}` }, { quoted: msg });
    }
  },
};
