const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const ffmpegPath = require('ffmpeg-static');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, (error) => (error ? reject(error) : resolve()));
  });
}

module.exports = {
  name: 'tovideo',
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const stickerMessage = quoted?.stickerMessage || msg.message?.stickerMessage;

    if (!stickerMessage) {
      await sock.sendMessage(chatJid, { text: '🌀 Répondez à un sticker animé (gif) avec *.tovideo* pour le convertir en vidéo.' }, { quoted: msg });
      return;
    }

    const tmpIn = path.join(os.tmpdir(), `tovideo_in_${Date.now()}.webp`);
    const tmpOut = path.join(os.tmpdir(), `tovideo_out_${Date.now()}.mp4`);

    try {
      const buffer = await downloadMediaMessage({ message: { stickerMessage } }, 'buffer', {});
      fs.writeFileSync(tmpIn, buffer);
      await runFfmpeg(['-y', '-i', tmpIn, '-movflags', 'faststart', '-pix_fmt', 'yuv420p', tmpOut]);
      const videoBuffer = fs.readFileSync(tmpOut);
      await sock.sendMessage(chatJid, { video: videoBuffer }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec de la conversion (le sticker est peut-être fixe, pas animé) : ${e.message}` }, { quoted: msg });
    } finally {
      [tmpIn, tmpOut].forEach((f) => { try { fs.unlinkSync(f); } catch (_) {} });
    }
  },
};
