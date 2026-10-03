// .tts / .say — convertit du texte en audio vocal (Google Translate TTS, gratuit)
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const googleTTS = require('google-tts-api');

const execFileAsync = promisify(execFile);
let FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
try { FFMPEG_PATH = process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg'; } catch { /* binaire système */ }

module.exports = {
  name: 'tts',
  aliases: ['say'],
  description: 'Convertit du texte en audio vocal. Usage : .tts <texte>',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const text = args.join(' ').trim();
    if (!text) {
      await sock.sendMessage(jid, { text: '🔊 Donne un texte à convertir !\nEx : .tts Bonjour tout le monde' }, { quoted: msg });
      return;
    }
    const url = googleTTS.getAudioUrl(text, { lang: 'fr', slow: false, host: 'https://translate.google.com' });
    let mp3File, oggFile;
    try {
      const tmpDir = os.tmpdir();
      mp3File = path.join(tmpDir, `tts_${Date.now()}.mp3`);
      oggFile = path.join(tmpDir, `tts_${Date.now()}.ogg`);
      const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
      fs.writeFileSync(mp3File, Buffer.from(data));
      await execFileAsync(FFMPEG_PATH, ['-i', mp3File, '-c:a', 'libopus', '-ac', '1', '-ar', '16000', '-b:a', '32k', oggFile, '-y']);
      const result = fs.readFileSync(oggFile);
      await sock.sendMessage(jid, { audio: result, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
    } catch (error) {
      console.error('[TTS ERROR]', error.message);
      // Repli : on envoie directement le mp3 de Google si ffmpeg a échoué.
      await sock.sendMessage(jid, { audio: { url }, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
    } finally {
      for (const f of [mp3File, oggFile]) { if (f && fs.existsSync(f)) { try { fs.unlinkSync(f); } catch {} } }
    }
  },
};
