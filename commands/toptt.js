const { downloadContentFromMessage } = require('@nyxcore/nyxcoresocket');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ffmpeg-static si dispo, sinon ffmpeg installé sur le serveur.
let ffmpegPath = 'ffmpeg';
try { ffmpegPath = require('ffmpeg-static') || 'ffmpeg'; } catch (_) { /* binaire système */ }

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { timeout: 120000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error((stderr || error.message || '').toString().trim().split('\n').pop() || error.message));
      resolve();
    });
  });
}

// Déballe viewOnce / ephemeral / documentWithCaption.
function unwrapMessage(raw) {
  if (!raw) return null;
  let message = raw;
  for (let i = 0; i < 5; i++) {
    const next = message.ephemeralMessage?.message
      || message.viewOnceMessageV2Extension?.message
      || message.viewOnceMessageV2?.message
      || message.viewOnceMessage?.message
      || message.documentWithCaptionMessage?.message;
    if (!next) break;
    message = next;
  }
  return message;
}

async function downloadBuffer(mediaMsg, type) {
  const stream = await downloadContentFromMessage(mediaMsg, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = {
  name: 'toptt',
  aliases: ['tovoice', 'tovn'],
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;
    const quoted = unwrapMessage(msg.message?.extendedTextMessage?.contextInfo?.quotedMessage);
    const own = unwrapMessage(msg.message);
    const audioMessage = quoted?.audioMessage || own?.audioMessage;
    const videoMessage = quoted?.videoMessage || own?.videoMessage;

    if (!audioMessage && !videoMessage) {
      await sock.sendMessage(chatJid, { text: '🎙️ Répondez à un audio ou une vidéo avec *.toptt* pour le convertir en message vocal.' }, { quoted: msg });
      return;
    }

    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tmpIn = path.join(os.tmpdir(), `toptt_in_${stamp}`);
    const tmpOut = path.join(os.tmpdir(), `toptt_out_${stamp}.ogg`);

    try {
      const buffer = audioMessage
        ? await downloadBuffer(audioMessage, 'audio')
        : await downloadBuffer(videoMessage, 'video');
      if (!buffer || buffer.length === 0) throw new Error('Média introuvable — transfère-le à nouveau et réessaie.');

      fs.writeFileSync(tmpIn, buffer);
      await runFfmpeg([
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', tmpIn, '-vn',
        '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1',
        '-f', 'ogg', tmpOut,
      ]);

      const oggBuffer = fs.readFileSync(tmpOut);
      if (!oggBuffer.length) throw new Error('La conversion a produit un fichier vide.');
      await sock.sendMessage(chatJid, { audio: oggBuffer, ptt: true, mimetype: 'audio/ogg; codecs=opus' }, { quoted: msg });
    } catch (e) {
      console.error('[TOPTT ERROR]', e);
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    } finally {
      [tmpIn, tmpOut].forEach((f) => { try { fs.unlinkSync(f); } catch (_) {} });
    }
  },
};
