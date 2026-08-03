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
  name: 'toptt',
  aliases: ['tovoice', 'tovn'],
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const audioMessage = quoted?.audioMessage || msg.message?.audioMessage;
    const videoMessage = quoted?.videoMessage || msg.message?.videoMessage;

    if (!audioMessage && !videoMessage) {
      await sock.sendMessage(chatJid, { text: '🎙️ Répondez à un audio ou une vidéo avec *.toptt* pour le convertir en message vocal.' }, { quoted: msg });
      return;
    }

    const tmpIn = path.join(os.tmpdir(), `toptt_in_${Date.now()}`);
    const tmpOut = path.join(os.tmpdir(), `toptt_out_${Date.now()}.ogg`);

    try {
      const buffer = audioMessage
        ? await downloadMediaMessage({ message: { audioMessage } }, 'buffer', {})
        : await downloadMediaMessage({ message: { videoMessage } }, 'buffer', {});
      fs.writeFileSync(tmpIn, buffer);
      await runFfmpeg(['-y', '-i', tmpIn, '-vn', '-acodec', 'libopus', '-b:a', '32k', tmpOut]);
      const oggBuffer = fs.readFileSync(tmpOut);
      await sock.sendMessage(chatJid, { audio: oggBuffer, ptt: true, mimetype: 'audio/ogg; codecs=opus' }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    } finally {
      [tmpIn, tmpOut].forEach((f) => { try { fs.unlinkSync(f); } catch (_) {} });
    }
  },
};
