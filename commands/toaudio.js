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
  name: 'toaudio',
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const videoMessage = quoted?.videoMessage || msg.message?.videoMessage;

    if (!videoMessage) {
      await sock.sendMessage(chatJid, { text: "🎬 Répondez à une vidéo avec *.toaudio* pour en extraire l'audio." }, { quoted: msg });
      return;
    }

    const tmpIn = path.join(os.tmpdir(), `toaudio_in_${Date.now()}.mp4`);
    const tmpOut = path.join(os.tmpdir(), `toaudio_out_${Date.now()}.mp3`);

    try {
      const buffer = await downloadMediaMessage({ message: { videoMessage } }, 'buffer', {});
      fs.writeFileSync(tmpIn, buffer);
      await runFfmpeg(['-y', '-i', tmpIn, '-vn', '-acodec', 'libmp3lame', tmpOut]);
      const audioBuffer = fs.readFileSync(tmpOut);
      await sock.sendMessage(chatJid, { audio: audioBuffer, mimetype: 'audio/mpeg' }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    } finally {
      [tmpIn, tmpOut].forEach((f) => { try { fs.unlinkSync(f); } catch (_) {} });
    }
  },
};
