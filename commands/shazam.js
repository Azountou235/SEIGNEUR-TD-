// .shazam — identifie une musique à partir d'un audio/vidéo et télécharge le titre complet
// Utilise un compte ACRCloud de démonstration par défaut (limité, partagé).
// Pour un usage sérieux, crée ton propre compte gratuit sur https://www.acrcloud.com
// et renseigne ACR_HOST / ACR_ACCESS_KEY / ACR_ACCESS_SECRET.
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const FormData = require('form-data');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { KEITH_BASE } = require('../config/apis');

const execFileAsync = promisify(execFile);
let FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
try { FFMPEG_PATH = process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg'; } catch { /* binaire système */ }

const ACR_HOST = process.env.ACR_HOST || 'identify-eu-west-1.acrcloud.com';
const ACR_ACCESS_KEY = process.env.ACR_ACCESS_KEY || '678eed85d47920b4737382eff9adfe46';
const ACR_ACCESS_SECRET = process.env.ACR_ACCESS_SECRET || 'l70euTw5vrswSmnKk4T0EglrtPfpUhSzVi04Evea';

function extractMediaTarget(msg) {
  const message = msg.message;
  if (message?.audioMessage) return { type: 'audio', message, key: msg.key };
  if (message?.videoMessage) return { type: 'video', message, key: msg.key };
  const ctx = message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (quoted?.audioMessage) return { type: 'audio', message: quoted, key: { remoteJid: msg.key.remoteJid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant } };
  if (quoted?.videoMessage) return { type: 'video', message: quoted, key: { remoteJid: msg.key.remoteJid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant } };
  return null;
}

async function identifyWithACRCloud(filePath) {
  if (!ACR_HOST || !ACR_ACCESS_KEY || !ACR_ACCESS_SECRET) throw new Error('Identifiants ACRCloud non configurés.');
  const method = 'POST', uri = '/v1/identify', dataType = 'audio', sigVersion = '1';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const stringToSign = [method, uri, ACR_ACCESS_KEY, dataType, sigVersion, timestamp].join('\n');
  const signature = crypto.createHmac('sha1', ACR_ACCESS_SECRET).update(Buffer.from(stringToSign, 'utf-8')).digest('base64');
  const sample = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('sample', sample, { filename: 'sample', contentType: 'application/octet-stream' });
  form.append('sample_bytes', sample.length);
  form.append('access_key', ACR_ACCESS_KEY);
  form.append('data_type', dataType);
  form.append('signature_version', sigVersion);
  form.append('signature', signature);
  form.append('timestamp', timestamp);
  const { data } = await axios.post(`https://${ACR_HOST}${uri}`, form, { headers: form.getHeaders(), timeout: 20000 });
  return data;
}

module.exports = {
  name: 'shazam',
  description: "Identifie une chanson à partir d'un audio/vidéo et télécharge le titre complet.",
  execute: async (sock, msg) => {
    const jid = msg.key.remoteJid;
    const target = extractMediaTarget(msg);
    if (!target) {
      await sock.sendMessage(jid, { text: '🎧 Réponds à une note vocale, un audio ou une courte vidéo avec *.shazam*.' }, { quoted: msg });
      return;
    }
    await sock.sendMessage(jid, { react: { text: '🔎', key: msg.key } });
    let inFile, outFile;
    try {
      const buffer = await downloadMediaMessage({ key: target.key, message: target.message }, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
      const tmpDir = os.tmpdir();
      const ext = target.type === 'video' ? 'mp4' : 'ogg';
      inFile = path.join(tmpDir, `shazam_in_${Date.now()}.${ext}`);
      outFile = path.join(tmpDir, `shazam_out_${Date.now()}.mp3`);
      fs.writeFileSync(inFile, buffer);
      await execFileAsync(FFMPEG_PATH, ['-y', '-i', inFile, '-t', '20', '-vn', '-ac', '1', '-ar', '44100', '-f', 'mp3', outFile]);

      const result = await identifyWithACRCloud(outFile);
      if (result?.status?.code !== 0 || !result?.metadata?.music?.length) {
        await sock.sendMessage(jid, { text: "😕 Impossible d'identifier ce morceau. Essaie un extrait plus clair." }, { quoted: msg });
        return;
      }
      const track = result.metadata.music[0];
      const title = track.title;
      const artist = track.artists?.map((a) => a.name).join(', ') || 'Inconnu';
      const album = track.album?.name;
      const releaseDate = track.release_date;
      const spotifyId = track.external_metadata?.spotify?.track?.id;
      const spotifyUrl = spotifyId ? `https://open.spotify.com/track/${spotifyId}` : null;
      const appleUrl = track.external_metadata?.apple_music?.url || null;
      const cover = track.external_metadata?.spotify?.album?.images?.[0]?.url || null;
      const caption = [
        `🎵 *${title}*`,
        `👤 *Artiste :* ${artist}`,
        album ? `💿 *Album :* ${album}` : null,
        releaseDate ? `📅 *Sortie :* ${releaseDate}` : null,
        spotifyUrl ? `🟢 *Spotify :* ${spotifyUrl}` : null,
        appleUrl ? `🍎 *Apple Music :* ${appleUrl}` : null,
      ].filter(Boolean).join('\n');

      if (cover) await sock.sendMessage(jid, { image: { url: cover }, caption }, { quoted: msg });
      else await sock.sendMessage(jid, { text: caption }, { quoted: msg });

      const searchQuery = `${title} ${artist}`;
      await sock.sendMessage(jid, { text: `🎧 Téléchargement de *${searchQuery}*...` }, { quoted: msg });
      const { data: search } = await axios.get(`${KEITH_BASE}/search/yts?query=${encodeURIComponent(searchQuery)}`);
      const results = search?.result;
      if (!Array.isArray(results) || results.length === 0) throw new Error('Morceau introuvable sur YouTube.');
      const { data: dl } = await axios.get(`${KEITH_BASE}/download/audio?url=${encodeURIComponent(results[0].url)}`);
      if (!dl?.result) throw new Error("Échec du téléchargement de l'audio.");
      await sock.sendMessage(jid, { audio: { url: dl.result }, mimetype: 'audio/mpeg', fileName: `${title}.mp3`, ptt: false }, { quoted: msg });
    } catch (error) {
      console.error('[SHAZAM ERROR]', error);
      await sock.sendMessage(jid, { text: `⚠️ ${error.message}` }, { quoted: msg });
    } finally {
      for (const f of [inFile, outFile]) { if (f && fs.existsSync(f)) { try { fs.unlinkSync(f); } catch {} } }
    }
  },
};
