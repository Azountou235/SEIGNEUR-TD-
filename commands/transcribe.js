// .transcribe — transcrit un audio/vidéo cité en texte
// ⚠️ Utilise l'API non-officielle de reconnaissance vocale de Google
// (endpoint non documenté, pas l'API Cloud Speech officielle). Elle peut
// cesser de fonctionner sans préavis. Pour un résultat plus fiable, crée
// une vraie clé Google Cloud Speech-to-Text et mets-la dans GOOGLE_STT_KEY.
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const execFileAsync = promisify(execFile);
let FFMPEG_PATH = 'ffmpeg';
try { FFMPEG_PATH = require('ffmpeg-static') || 'ffmpeg'; } catch { /* binaire système */ }

const GOOGLE_KEY = process.env.GOOGLE_STT_KEY || 'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw';

function resolveJid(msg) {
  const jid = msg.key.remoteJid;
  return jid.endsWith('@lid') && msg.key.remoteJidAlt ? msg.key.remoteJidAlt : jid;
}

module.exports = {
  name: 'transcribe',
  aliases: ['speech2text', 'audio2text'],
  description: 'Transcrit un audio ou une vidéo citée en texte.',
  execute: async (sock, msg) => {
    const jid = resolveJid(msg);
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const audio = quoted?.audioMessage;
    const video = quoted?.videoMessage;
    if (!audio && !video) {
      await sock.sendMessage(jid, { text: '📌 Réponds à un audio ou une vidéo pour le transcrire.' }, { quoted: msg });
      return;
    }
    const wait = await sock.sendMessage(jid, { text: '🎙️ *Transcription en cours...*' }, { quoted: msg });
    let rawFile, flacFile;
    try {
      const buffer = await downloadMediaMessage(
        { key: { remoteJid: jid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant }, message: quoted },
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );
      rawFile = path.join(os.tmpdir(), `transcribe_raw_${Date.now()}`);
      flacFile = path.join(os.tmpdir(), `transcribe_${Date.now()}.flac`);
      fs.writeFileSync(rawFile, buffer);
      await execFileAsync(FFMPEG_PATH, ['-y', '-i', rawFile, '-ac', '1', '-ar', '16000', '-f', 'flac', flacFile]);

      const flacData = fs.readFileSync(flacFile);
      const { data } = await axios.post(
        `https://www.google.com/speech-api/v2/recognize?output=json&lang=fr-FR&key=${GOOGLE_KEY}`,
        flacData,
        { headers: { 'Content-Type': 'audio/x-flac; rate=16000' }, timeout: 30000 }
      );
      const lines = String(data).trim().split('\n').filter((l) => l.trim() && l !== '{}');
      let transcript = '';
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const t = parsed?.result?.[0]?.alternative?.[0]?.transcript;
          if (t) transcript += t + ' ';
        } catch { /* ligne ignorée */ }
      }
      transcript = transcript.trim();
      if (!transcript) throw new Error("Aucune parole détectée. L'audio est peut-être trop court ou peu clair.");
      await sock.sendMessage(jid, { text: `📝 *Transcription*\n\n${transcript}`, edit: wait.key }, { quoted: msg });
    } catch (error) {
      console.error('[TRANSCRIBE ERROR]', error.message);
      await sock.sendMessage(jid, { text: `❌ Échec de la transcription : ${error.message}`, edit: wait.key }, { quoted: msg });
    } finally {
      for (const f of [rawFile, flacFile]) { if (f && fs.existsSync(f)) { try { fs.unlinkSync(f); } catch {} } }
    }
  },
};
