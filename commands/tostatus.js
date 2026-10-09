// tostatus.js — publie texte/image/vidéo/audio sur TON statut WhatsApp.
// Basé sur la version fonctionnelle : le statut est envoyé avec une
// statusJidList (sans elle, WhatsApp ne l'affiche à personne).
const { downloadContentFromMessage } = require('@nyxcore/nyxcoresocket');
const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

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

async function streamToBuffer(mediaObj, type) {
  const stream = await downloadContentFromMessage(mediaObj, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Convertit un audio en vraie vidéo de statut (fond sombre + waveform).
async function audioToStatusVideo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Aucune donnée audio téléchargée.');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  let FFMPEG_PATH = 'ffmpeg';
  try { FFMPEG_PATH = require('ffmpeg-static') || 'ffmpeg'; } catch { /* binaire système */ }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tostatus-audio-'));
  const inputPath = path.join(tempDir, 'source-audio');
  const outputPath = path.join(tempDir, 'audio-status.mp4');
  try {
    fs.writeFileSync(inputPath, buffer);
    await promisify(execFile)(FFMPEG_PATH, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inputPath,
      '-filter_complex',
      '[0:a:0]showwaves=s=640x280:mode=line:rate=25:colors=0x25D366[wave];color=c=0x111827:s=720x1280:r=25[bg];[bg][wave]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]',
      '-map', '[v]', '-map', '0:a:0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage',
      '-pix_fmt', 'yuv420p',
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '128k', '-ar', '48000', '-ac', '2',
      '-shortest', '-movflags', '+faststart', outputPath,
    ], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const video = fs.readFileSync(outputPath);
    if (!video.length) throw new Error('La conversion audio → vidéo a produit un fichier vide.');
    return video;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Mode d'envoi des audios / notes vocales en statut :
//   'audio' = vrai vocal (si l'envoi échoue, bascule automatiquement en vidéo)
//   'video' = convertit toujours en vidéo avec waveform (ancien comportement)
const AUDIO_MODE = 'audio';

// Prépare un vrai vocal WhatsApp (ogg/opus). Si c'est déjà un vocal ogg,
// on l'envoie tel quel ; sinon (mp3, m4a...) on le convertit avec ffmpeg.
async function toVoiceNote(buffer, audioMsg) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Aucune donnée audio téléchargée.');
  if (audioMsg?.ptt && /ogg/i.test(audioMsg.mimetype || '')) return buffer;
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  let FFMPEG_PATH = 'ffmpeg';
  try { FFMPEG_PATH = require('ffmpeg-static') || 'ffmpeg'; } catch { /* binaire système */ }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-voice-'));
  const inputPath = path.join(tempDir, 'source-audio');
  const outputPath = path.join(tempDir, 'voice.ogg');
  try {
    fs.writeFileSync(inputPath, buffer);
    await promisify(execFile)(FFMPEG_PATH, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inputPath, '-vn',
      '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000', '-ac', '1',
      '-f', 'ogg', outputPath,
    ], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const out = fs.readFileSync(outputPath);
    if (!out.length) throw new Error('La conversion en vocal a produit un fichier vide.');
    return out;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Liste des destinataires du statut :
// 1) les numéros définis avec .setstatusviewers (s'il y en a) ;
// 2) sinon les contacts connus du socket (sock.store) ;
// 3) sinon tous les membres des groupes où le bot est présent.
// Le numéro du bot est toujours ajouté.
async function getStatusJidList(sock) {
  const set = new Set();
  const add = (id) => {
    if (!id || typeof id !== 'string') return;
    if (id.endsWith('@s.whatsapp.net')) set.add(id.replace(/:\d+@/, '@'));
  };

  const viewers = settingsStore.get('statusViewers', []);
  if (viewers.length) {
    viewers.forEach((n) => add(`${String(n).replace(/\D/g, '')}@s.whatsapp.net`));
  } else {
    const contacts = sock.store?.contacts;
    if (contacts) {
      Object.values(contacts).forEach((c) => add(c?.phoneNumber || c?.id));
    }
    if (set.size === 0) {
      try {
        const groups = await sock.groupFetchAllParticipating();
        Object.values(groups || {}).forEach((g) => {
          (g.participants || []).forEach((p) => add(p.phoneNumber || p.id));
        });
      } catch { /* on retombe sur le numéro du bot seul */ }
    }
  }

  add(sock.user?.id);
  return [...set];
}

module.exports = {
  name: 'tostatus',
  description: 'Publie texte/image/vidéo/audio sur ton statut.',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const reply = (text) => sock.sendMessage(chatJid, { text }, { quoted: msg });

    if (!isOwner(msg)) return reply('🚫 Seul le owner peut publier sur le statut.');

    const statusText = args.join(' ').trim();
    const own = unwrapMessage(msg.message);
    const quoted = unwrapMessage(msg.message?.extendedTextMessage?.contextInfo?.quotedMessage);

    const image = own?.imageMessage || quoted?.imageMessage;
    const video = own?.videoMessage || quoted?.videoMessage;
    const audio = own?.audioMessage || quoted?.audioMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;

    if (!image && !video && !audio && !statusText && !quotedText) {
      return reply(
        '📤 Utilisation de *.tostatus* :\n\n' +
        '📝 Texte : *.tostatus Mon texte*\n' +
        '🖼️ Image : réponds à une image\n' +
        '🎬 Vidéo : réponds à une vidéo\n' +
        '🎙️ Audio / vocal : réponds à un audio'
      );
    }

    await sock.sendMessage(chatJid, { react: { text: '⏳', key: msg.key } });

    try {
      const statusJidList = await getStatusJidList(sock);
      if (statusJidList.length === 0) {
        throw new Error('Aucun destinataire trouvé. Ajoutes-en avec .setstatusviewers <numéros>.');
      }

      let content, label, fallbackBuilder = null;

      if (image) {
        const buffer = await streamToBuffer(image, 'image');
        if (!buffer.length) throw new Error('Média introuvable — transfère-le à nouveau et réessaie.');
        content = { image: buffer, caption: statusText || image.caption || '' };
        label = '🖼️ Image';
      } else if (video) {
        const buffer = await streamToBuffer(video, 'video');
        if (!buffer.length) throw new Error('Média introuvable — transfère-le à nouveau et réessaie.');
        content = { video: buffer, mimetype: 'video/mp4', caption: statusText || video.caption || '' };
        label = '🎬 Vidéo';
      } else if (audio) {
        const audioBuffer = await streamToBuffer(audio, 'audio');
        if (!audioBuffer.length) throw new Error('Média introuvable — transfère-le à nouveau et réessaie.');
        const buildVideo = async () => ({
          video: await audioToStatusVideo(audioBuffer), mimetype: 'video/mp4', caption: statusText || audio.caption || '',
        });
        if (AUDIO_MODE === 'audio') {
          try {
            content = { audio: await toVoiceNote(audioBuffer, audio), mimetype: 'audio/ogg; codecs=opus', ptt: true };
            label = audio.ptt ? '🎙️ Note vocale' : '🔊 Audio (en vocal)';
            fallbackBuilder = buildVideo;
          } catch (err) {
            console.warn('[tostatus] vocal impossible, bascule en vidéo :', err.message);
          }
        }
        if (!content) {
          content = await buildVideo();
          label = audio.ptt ? '🎙️ Note vocale (convertie en vidéo)' : '🔊 Audio (converti en vidéo)';
        }
      } else {
        content = { text: statusText || quotedText, backgroundColor: '#000000', font: 0 };
        label = '📝 Texte';
      }

      try {
        await sock.sendMessage('status@broadcast', content, { statusJidList });
      } catch (err) {
        if (!fallbackBuilder) throw err;
        console.warn('[tostatus] envoi du vocal refusé, bascule en vidéo :', err.message);
        content = await fallbackBuilder();
        label += ' → envoyé en vidéo';
        await sock.sendMessage('status@broadcast', content, { statusJidList });
      }

      await sock.sendMessage(chatJid, { react: { text: '✅', key: msg.key } });
      await reply(`✅ Statut ${label} publié, visible par ${statusJidList.length} contact(s).`);
    } catch (e) {
      console.error('[TOSTATUS ERROR]', e);
      await sock.sendMessage(chatJid, { react: { text: '❌', key: msg.key } });
      await reply(`❌ Erreur : ${e.message}`);
    }
  },
};
